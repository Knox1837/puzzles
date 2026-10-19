import { describe, it, expect } from 'vitest';
import {
  applyMove,
  countPieces,
  createGame,
  getStatus,
  legalMoves,
  parseBoard,
  validateMove,
  idxOf,
  squareOf,
  isDark,
  type CheckersState,
  type Square,
} from '../src/engines/checkers/engine';

const play = (state: CheckersState, ...paths: Square[][]) =>
  paths.reduce((s, path) => applyMove(s, { path }), state);

const pathsOf = (state: CheckersState) => legalMoves(state).map((m) => m.path.join('>')).sort();

describe('board helpers', () => {
  it('maps squares and indexes both ways', () => {
    expect(idxOf('a1')).toBe(0);
    expect(idxOf('h8')).toBe(63);
    expect(squareOf(9)).toBe('b2');
    for (let i = 0; i < 64; i++) expect(idxOf(squareOf(i))).toBe(i);
  });

  it('has a dark a1 and 32 dark squares', () => {
    expect(isDark(idxOf('a1'))).toBe(true);
    expect(isDark(idxOf('b1'))).toBe(false);
    expect(Array.from({ length: 64 }, (_, i) => i).filter(isDark)).toHaveLength(32);
  });

  it('parseBoard rejects bad diagrams', () => {
    expect(() => parseBoard(['........'])).toThrow(RangeError);
    const rows = Array(8).fill('........');
    rows[7] = '.b......'; // b1 is a light square
    expect(() => parseBoard(rows)).toThrow(RangeError);
    rows[7] = 'x.......';
    expect(() => parseBoard(rows)).toThrow(RangeError);
  });
});

describe('starting position', () => {
  const game = createGame();

  it('has 12 men each, black to move, and 7 legal moves', () => {
    expect(countPieces(game.board)).toEqual({ b: 12, w: 12, bKings: 0, wKings: 0 });
    expect(game.turn).toBe('b');
    expect(pathsOf(game)).toEqual(['a3>b4', 'c3>b4', 'c3>d4', 'e3>d4', 'e3>f4', 'g3>f4', 'g3>h4']);
    expect(getStatus(game)).toEqual({ kind: 'playing' });
  });

  it('puts men on the right squares', () => {
    expect(game.board[idxOf('a1')]).toBe('b');
    expect(game.board[idxOf('h2')]).toBe('b');
    expect(game.board[idxOf('b8')]).toBe('w');
    expect(game.board[idxOf('g7')]).toBe('w');
    expect(game.board[idxOf('b4')]).toBe('.');
  });
});

describe('simple moves', () => {
  it('moves a man, switches the turn and leaves the old state untouched', () => {
    const start = createGame();
    const next = applyMove(start, { path: ['c3', 'd4'] });
    expect(next.board[idxOf('d4')]).toBe('b');
    expect(next.board[idxOf('c3')]).toBe('.');
    expect(next.turn).toBe('w');
    expect(next.moves[0]).toMatchObject({ notation: 'c3-d4', side: 'b', captures: [] });
    expect(start.board[idxOf('c3')]).toBe('b');
    expect(start.moves).toHaveLength(0);
  });

  it('does not let men move backwards or sideways', () => {
    const state = parseBoard([
      '........',
      '........',
      '........',
      '........',
      '...b....',
      '........',
      '........',
      '........',
    ]);
    expect(pathsOf(state)).toEqual(['d4>c5', 'd4>e5']);
  });

  it('rejects illegal moves and the wrong side', () => {
    const game = createGame();
    expect(validateMove(game, { path: ['c3', 'c4'] }).ok).toBe(false);
    expect(validateMove(game, { path: ['b6', 'a5'] }).ok).toBe(false); // white piece, black's turn
    expect(() => applyMove(game, { path: ['a1', 'b2'] })).toThrow(); // blocked by own man
  });
});

describe('captures', () => {
  const single = parseBoard([
    '........',
    '........',
    '........',
    '........',
    '...w....',
    '..b.....',
    '........',
    '........',
  ]);

  it('are mandatory', () => {
    // c3 can step to b4 or jump d4; only the jump is legal.
    expect(pathsOf(single)).toEqual(['c3>e5']);
    const bad = validateMove(single, { path: ['c3', 'b4'] });
    expect(bad).toEqual({ ok: false, reason: 'A capture is mandatory' });
  });

  it('remove the captured piece', () => {
    const next = applyMove(single, { path: ['c3', 'e5'] });
    expect(next.board[idxOf('d4')]).toBe('.');
    expect(next.board[idxOf('e5')]).toBe('b');
    expect(next.moves[0]).toMatchObject({ notation: 'c3xe5', captures: ['d4'] });
    expect(getStatus(next)).toMatchObject({ kind: 'win', winner: 'b', reason: 'no-pieces' });
  });

  it('must continue with multi-jumps', () => {
    const state = parseBoard([
      '........',
      '........',
      '.....w..',
      '........',
      '...w....',
      '..b.....',
      '........',
      '........',
    ]);
    expect(pathsOf(state)).toEqual(['c3>e5>g7']);
    expect(validateMove(state, { path: ['c3', 'e5'] })).toEqual({
      ok: false,
      reason: 'You must keep jumping',
    });
    const next = applyMove(state, { path: ['c3', 'e5', 'g7'] });
    expect(next.moves[0].notation).toBe('c3xe5xg7');
    expect(countPieces(next.board).w).toBe(0);
  });

  it('lets the player choose between different captures', () => {
    const state = parseBoard([
      '........',
      '........',
      '........',
      '..w.w...',
      '...b....',
      '........',
      '........',
      '........',
    ]);
    expect(pathsOf(state)).toEqual(['d4>b6', 'd4>f6']);
  });

  it('forces captures before any other piece may move', () => {
    const state = parseBoard([
      '........',
      '........',
      '........',
      '........',
      '...w....',
      '..b.....',
      '.......b',
      '........',
    ]);
    // h2 has a simple move, but c3 must capture.
    expect(pathsOf(state)).toEqual(['c3>e5']);
  });

  it('cannot jump the same piece twice in one move', () => {
    // A king circling a lone piece must not capture it twice.
    const state = parseBoard([
      '........',
      '........',
      '........',
      '..w.....',
      '.B......',
      '........',
      '........',
      '........',
    ]);
    const moves = legalMoves(state);
    expect(moves).toHaveLength(1);
    expect(moves[0].captures).toEqual(['c5']);
    expect(moves[0].path).toEqual(['b4', 'd6']);
  });

  it('does not allow jumping over your own pieces or onto an occupied square', () => {
    const blocked = parseBoard([
      '........',
      '........',
      '........',
      '....w...',
      '...w....',
      '..b.....',
      '........',
      '........',
    ]);
    // d4 is guarded by e5, so c3 has no jump and plays a normal step.
    expect(pathsOf(blocked)).toEqual(['c3>b4']);
  });
});

describe('kings', () => {
  it('crown on the far row after a step', () => {
    const state = parseBoard([
      '........',
      '..b.....',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]);
    const next = applyMove(state, { path: ['c7', 'b8'] });
    expect(next.board[idxOf('b8')]).toBe('B');
    expect(next.moves[0].promoted).toBe(true);
    expect(countPieces(next.board).bKings).toBe(1);
  });

  it('move and capture backwards', () => {
    const state = parseBoard([
      '........',
      '........',
      '........',
      '........',
      '...B....',
      '..w.....',
      '........',
      '........',
    ]);
    expect(pathsOf(state)).toEqual(['d4>b2']);
    const quiet = parseBoard([
      '........',
      '........',
      '........',
      '........',
      '...B....',
      '........',
      '........',
      '........',
    ]);
    expect(pathsOf(quiet)).toEqual(['d4>c3', 'd4>c5', 'd4>e3', 'd4>e5']);
  });

  it('end the move when a man is crowned during a capture', () => {
    const state = parseBoard([
      '........',
      '....w.w.',
      '...b....',
      '........',
      '........',
      '........',
      '........',
      '........',
    ]);
    // d6 jumps e7 and lands on f8 and is crowned. As a king it could continue over g7 to h6,
    // but the move ends on the crowning square.
    expect(pathsOf(state)).toEqual(['d6>f8']);
    const next = applyMove(state, { path: ['d6', 'f8'] });
    expect(next.board[idxOf('f8')]).toBe('B');
    expect(next.board[idxOf('g7')]).toBe('w'); // still there
  });
});

describe('game end', () => {
  it('a player with no legal moves loses', () => {
    const state = parseBoard([
      '........',
      '........',
      '........',
      '........',
      '........',
      '..w.....',
      '.w......',
      'b.......',
    ]);
    expect(legalMoves(state)).toHaveLength(0);
    expect(getStatus(state)).toEqual({ kind: 'win', winner: 'w', reason: 'no-moves' });
    expect(validateMove(state, { path: ['a1', 'b2'] })).toEqual({ ok: false, reason: 'The game is over' });
  });

  it('draws on threefold repetition', () => {
    let state = parseBoard([
      '.......W',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      'B.......',
    ]);
    const cycle: Square[][] = [
      ['a1', 'b2'],
      ['h8', 'g7'],
      ['b2', 'a1'],
      ['g7', 'h8'],
    ];
    state = play(state, ...cycle);
    expect(getStatus(state).kind).toBe('playing'); // second occurrence
    state = play(state, ...cycle);
    expect(getStatus(state)).toEqual({ kind: 'draw', reason: 'repetition' });
  });

  it('draws after 40 moves each without a capture or man move', () => {
    const base = parseBoard([
      '.......W',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      'B.......',
    ]);
    expect(getStatus({ ...base, quietPlies: 79 }).kind).toBe('playing');
    expect(getStatus({ ...base, quietPlies: 80 })).toEqual({ kind: 'draw', reason: 'forty-move' });
  });

  it('counts quiet plies and resets them on man moves and captures', () => {
    const kings = parseBoard([
      '.......W',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      'B.......',
    ]);
    const afterKingMove = applyMove(kings, { path: ['a1', 'b2'] });
    expect(afterKingMove.quietPlies).toBe(1);

    const withMan = applyMove(createGame(), { path: ['c3', 'd4'] });
    expect(withMan.quietPlies).toBe(0);
  });
});

describe('a short real game', () => {
  it('plays an opening exchange with forced captures', () => {
    let state = createGame();
    state = play(state, ['c3', 'd4'], ['b6', 'a5'], ['d4', 'c5']);
    // White must capture the advanced man: d6 jumps c5 and lands on b4.
    expect(pathsOf(state)).toEqual(['d6>b4']);
    state = play(state, ['d6', 'b4']);
    expect(countPieces(state.board)).toMatchObject({ b: 11, w: 12 });
    // Black must recapture with a3.
    expect(pathsOf(state)).toEqual(['a3>c5']);
    state = play(state, ['a3', 'c5']);
    expect(countPieces(state.board)).toMatchObject({ b: 11, w: 11 });
    expect(state.moves.map((m) => m.notation)).toEqual(['c3-d4', 'b6-a5', 'd4-c5', 'd6xb4', 'a3xc5']);
  });
});