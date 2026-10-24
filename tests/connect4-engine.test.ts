import { describe, it, expect } from 'vitest';
import {
  applyMove,
  cellIndex,
  columnHeight,
  createGame,
  dropRow,
  getStatus,
  lastDiscIndex,
  legalMoves,
  parseBoard,
  validateMove,
  type ConnectFourState,
} from '../src/engines/connect4/engine';

const play = (state: ConnectFourState, columns: number[]) =>
  columns.reduce((s, column) => applyMove(s, { column }), state);

describe('new game', () => {
  const game = createGame();

  it('starts empty with red to move and seven open columns', () => {
    expect(game.board).toBe('.'.repeat(42));
    expect(game.turn).toBe('r');
    expect(legalMoves(game).map((m) => m.column)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(getStatus(game)).toEqual({ kind: 'playing' });
    expect(lastDiscIndex(game)).toBeNull();
  });
});

describe('dropping discs', () => {
  it('lands on the floor, then stacks, alternating colours', () => {
    const state = play(createGame(), [3, 3, 3]);
    expect(state.board[cellIndex(0, 3)]).toBe('r');
    expect(state.board[cellIndex(1, 3)]).toBe('y');
    expect(state.board[cellIndex(2, 3)]).toBe('r');
    expect(state.turn).toBe('y');
    expect(state.moves).toEqual([3, 3, 3]);
    expect(columnHeight(state.board, 3)).toBe(3);
    expect(lastDiscIndex(state)).toBe(cellIndex(2, 3));
  });

  it('does not mutate the previous state', () => {
    const start = createGame();
    const next = applyMove(start, { column: 0 });
    expect(start.board).toBe('.'.repeat(42));
    expect(start.moves).toHaveLength(0);
    expect(next).not.toBe(start);
  });

  it('refuses a full column and bad column numbers', () => {
    const full = play(createGame(), [0, 0, 0, 0, 0, 0]);
    expect(dropRow(full.board, 0)).toBe(-1);
    expect(validateMove(full, { column: 0 })).toEqual({ ok: false, reason: 'That column is full' });
    expect(legalMoves(full).map((m) => m.column)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(() => applyMove(full, { column: 0 })).toThrow('That column is full');

    for (const column of [-1, 7, 1.5, NaN]) {
      expect(validateMove(createGame(), { column }).ok).toBe(false);
    }
  });
});

describe('winning', () => {
  it('detects four across', () => {
    // Red drops 0,1,2,3 on the floor; yellow stacks on top of the first three.
    const state = play(createGame(), [0, 0, 1, 1, 2, 2, 3]);
    expect(getStatus(state)).toEqual({ kind: 'win', winner: 'r', line: [0, 1, 2, 3] });
  });

  it('detects four up', () => {
    const state = play(createGame(), [0, 1, 0, 1, 0, 1, 0]);
    expect(getStatus(state)).toMatchObject({ kind: 'win', winner: 'r' });
    expect((getStatus(state) as { line: number[] }).line).toEqual([0, 7, 14, 21]);
  });

  it('detects a diagonal made in a real game', () => {
    // Builds a red staircase (0,0) (1,1) (2,2) (3,3) while yellow fills underneath.
    const moves = [0, 1, 1, 2, 6, 2, 2, 3, 6, 3, 6, 3];
    const before = play(createGame(), moves);
    expect(getStatus(before)).toEqual({ kind: 'playing' });
    const after = applyMove(before, { column: 3 });
    expect(getStatus(after)).toMatchObject({ kind: 'win', winner: 'r' });
    expect((getStatus(after) as { line: number[] }).line).toEqual([
      cellIndex(0, 0),
      cellIndex(1, 1),
      cellIndex(2, 2),
      cellIndex(3, 3),
    ]);
  });

  it('detects both diagonal directions on prepared boards', () => {
    const up = parseBoard([
      '.......',
      '.......',
      '...y...',
      '..yr...',
      '.yrr...',
      'yrry...',
    ]);
    expect(getStatus(up)).toMatchObject({ kind: 'win', winner: 'y' }); // (0,0) (1,1) (2,2) (3,3)

    const down = parseBoard([
      '.......',
      '.......',
      'r......',
      'yr.....',
      'yyr....',
      'yyyr...',
    ]);
    expect(getStatus(down)).toMatchObject({ kind: 'win', winner: 'r' }); // (0,3) (1,2) (2,1) (3,0)
  });

  it('three in a row is not a win', () => {
    const state = play(createGame(), [0, 0, 1, 1, 2, 2]);
    expect(getStatus(state)).toEqual({ kind: 'playing' });
  });

  it('stops all moves once someone has won', () => {
    const won = play(createGame(), [0, 1, 0, 1, 0, 1, 0]);
    expect(legalMoves(won)).toEqual([]);
    expect(validateMove(won, { column: 5 })).toEqual({ ok: false, reason: 'The game is over' });
    expect(() => applyMove(won, { column: 5 })).toThrow('The game is over');
  });

  it('does not count a line broken by the other colour', () => {
    const broken = parseBoard([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      'rryrr..',
    ]);
    expect(getStatus(broken)).toEqual({ kind: 'playing' });
  });
});

describe('draw', () => {
  // A complete legal game found by search: 42 moves, no four in a row at any point.
  const DRAWN_GAME = [
    3, 1, 2, 3, 5, 5, 5, 0, 5, 1, 3, 4, 3, 4, 5, 6, 4, 3, 2, 5, 1, 2, 0, 4, 0, 2, 4, 3, 4, 0, 1, 0, 2, 1, 0, 1, 6,
    6, 2, 6, 6, 6,
  ];

  it('ends in a draw when the board fills with no winner', () => {
    expect(DRAWN_GAME).toHaveLength(42);
    const almost = play(createGame(), DRAWN_GAME.slice(0, 41));
    expect(getStatus(almost)).toEqual({ kind: 'playing' });
    expect(legalMoves(almost)).toHaveLength(1);

    const full = applyMove(almost, { column: DRAWN_GAME[41] });
    expect(full.board.includes('.')).toBe(false);
    expect(getStatus(full)).toEqual({ kind: 'draw' });
    expect(legalMoves(full)).toEqual([]);
  });
});

describe('parseBoard', () => {
  it('rejects malformed diagrams', () => {
    expect(() => parseBoard(['.......'])).toThrow(RangeError);
    expect(() => parseBoard(Array(6).fill('......x'))).toThrow(RangeError);
  });

  it('rejects floating discs', () => {
    const rows = Array(6).fill('.......');
    rows[2] = 'r......';
    expect(() => parseBoard(rows)).toThrow('Floating disc in column 1');
  });

  it('works out whose turn it is', () => {
    const one = parseBoard([...Array(5).fill('.......'), 'r......']);
    expect(one.turn).toBe('y');
    const two = parseBoard([...Array(5).fill('.......'), 'ry.....']);
    expect(two.turn).toBe('r');
  });
});