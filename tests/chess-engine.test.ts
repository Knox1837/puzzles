import { describe, it, expect } from 'vitest';
import {
  createGame,
  applyMove,
  getStatus,
  legalMoves,
  legalTargets,
  needsPromotion,
  validateMove,
  turn,
  kingSquare,
  getBoard,
  type ChessMove,
  type ChessState,
  type Square,
} from '../src/engines/chess/engine';

function play(state: ChessState, moves: [Square, Square][]): ChessState {
  return moves.reduce((s, [from, to]) => applyMove(s, { from, to }), state);
}

describe('chess engine', () => {
  it('starts with 20 legal moves and white to move', () => {
    const game = createGame();
    expect(legalMoves(game)).toHaveLength(20);
    expect(turn(game)).toBe('w');
    expect(getStatus(game)).toEqual({ kind: 'playing', check: false });
  });

  it('lays out the starting board correctly', () => {
    const board = getBoard(createGame());
    expect(board[0][4]).toMatchObject({ square: 'e8', type: 'k', color: 'b' });
    expect(board[7][4]).toMatchObject({ square: 'e1', type: 'k', color: 'w' });
    expect(board[4][4]).toBeNull();
  });

  it('rejects illegal moves and does not mutate the previous state', () => {
    const game = createGame();
    expect(validateMove(game, { from: 'e2', to: 'e5' }).ok).toBe(false);
    expect(validateMove(game, { from: 'e7', to: 'e5' }).ok).toBe(false); // wrong side
    expect(() => applyMove(game, { from: 'e2', to: 'e5' })).toThrow();

    const next = applyMove(game, { from: 'e2', to: 'e4' });
    expect(game.moves).toHaveLength(0);
    expect(next.moves).toHaveLength(1);
    expect(next.moves[0]).toMatchObject({ san: 'e4', color: 'w', piece: 'p' });
    expect(turn(next)).toBe('b');
  });

  it('lists legal targets for a piece', () => {
    expect(legalTargets(createGame(), 'e2').sort()).toEqual(['e3', 'e4']);
    expect(legalTargets(createGame(), 'g1').sort()).toEqual(['f3', 'h3']);
    expect(legalTargets(createGame(), 'e7')).toEqual([]); // not your turn
  });

  it("detects fool's mate (black wins)", () => {
    const game = play(createGame(), [
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['g2', 'g4'],
      ['d8', 'h4'],
    ]);
    expect(getStatus(game)).toEqual({ kind: 'checkmate', winner: 'b' });
    expect(validateMove(game, { from: 'a2', to: 'a3' }).ok).toBe(false);
  });

  it("detects scholar's mate (white wins)", () => {
    const game = play(createGame(), [
      ['e2', 'e4'],
      ['e7', 'e5'],
      ['f1', 'c4'],
      ['b8', 'c6'],
      ['d1', 'h5'],
      ['g8', 'f6'],
      ['h5', 'f7'],
    ]);
    expect(getStatus(game)).toEqual({ kind: 'checkmate', winner: 'w' });
  });

  it('reports check', () => {
    const game = play(createGame(), [
      ['e2', 'e4'],
      ['f7', 'f6'],
      ['d1', 'h5'],
    ]);
    expect(getStatus(game)).toEqual({ kind: 'playing', check: true });
    expect(kingSquare(game, 'b')).toBe('e8');
  });

  it('supports castling', () => {
    const game = createGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(legalTargets(game, 'e1')).toEqual(expect.arrayContaining(['g1', 'c1']));
    const castled = applyMove(game, { from: 'e1', to: 'g1' });
    const board = getBoard(castled);
    expect(board[7][6]).toMatchObject({ type: 'k', color: 'w' });
    expect(board[7][5]).toMatchObject({ type: 'r', color: 'w' });
  });

  it('supports en passant', () => {
    const game = play(createGame(), [
      ['e2', 'e4'],
      ['a7', 'a6'],
      ['e4', 'e5'],
      ['d7', 'd5'],
    ]);
    expect(legalTargets(game, 'e5')).toContain('d6');
    const after = applyMove(game, { from: 'e5', to: 'd6' });
    expect(after.moves[after.moves.length - 1].captured).toBe('p');
    expect(getBoard(after)[3][3]).toBeNull(); // the d5 pawn is gone
  });

  describe('promotion', () => {
    const fen = '8/P6k/8/8/8/8/8/K7 w - - 0 1';

    it('requires a promotion piece', () => {
      const game = createGame(fen);
      expect(needsPromotion(game, 'a7', 'a8')).toBe(true);
      expect(needsPromotion(game, 'a1', 'a2')).toBe(false);
      expect(validateMove(game, { from: 'a7', to: 'a8' }).ok).toBe(false);
      expect(validateMove(game, { from: 'a7', to: 'a8', promotion: 'q' }).ok).toBe(true);
    });

    it('promotes to the chosen piece', () => {
      const move: ChessMove = { from: 'a7', to: 'a8', promotion: 'n' };
      const after = applyMove(createGame(fen), move);
      expect(getBoard(after)[0][0]).toMatchObject({ type: 'n', color: 'w' });
    });

    it('rejects a promotion piece on a normal move', () => {
      const game = createGame();
      expect(validateMove(game, { from: 'e2', to: 'e4', promotion: 'q' }).ok).toBe(false);
    });
  });

  describe('draws', () => {
    it('detects stalemate', () => {
      const game = createGame('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
      expect(getStatus(game)).toEqual({ kind: 'draw', reason: 'stalemate' });
    });

    it('detects insufficient material', () => {
      const game = createGame('8/8/8/4k3/8/8/4K3/8 w - - 0 1');
      expect(getStatus(game)).toEqual({ kind: 'draw', reason: 'insufficient-material' });
    });

    it('detects the fifty-move rule', () => {
      const game = createGame('8/8/8/4k3/8/8/4K3/7R w - - 100 80');
      expect(getStatus(game)).toEqual({ kind: 'draw', reason: 'fifty-move' });
    });

    it('detects threefold repetition', () => {
      const game = play(createGame(), [
        ['g1', 'f3'],
        ['g8', 'f6'],
        ['f3', 'g1'],
        ['f6', 'g8'],
        ['g1', 'f3'],
        ['g8', 'f6'],
        ['f3', 'g1'],
        ['f6', 'g8'],
      ]);
      expect(getStatus(game)).toEqual({ kind: 'draw', reason: 'threefold-repetition' });
    });
  });
});