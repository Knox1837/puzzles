import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

export type { Color, PieceSymbol, Square };

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface ChessMove {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}

export interface MoveRecord extends ChessMove {
  san: string;
  color: Color;
  piece: PieceSymbol;
  captured?: PieceSymbol;
}

/**
 * Serializable game state: the starting position plus every move played.
 * Keeping the move list (not just the FEN) is what makes threefold
 * repetition detectable, and it is exactly what a server would store/sync.
 */
export interface ChessState {
  startFen: string;
  fen: string;
  moves: MoveRecord[];
}

export type DrawReason = 'stalemate' | 'insufficient-material' | 'threefold-repetition' | 'fifty-move';

export type GameStatus =
  | { kind: 'playing'; check: boolean }
  | { kind: 'checkmate'; winner: Color }
  | { kind: 'draw'; reason: DrawReason };

export interface LegalMove extends ChessMove {
  san: string;
  captured?: PieceSymbol;
}

export interface BoardPiece {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

export interface MoveResult {
  ok: boolean;
  reason?: string;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function createGame(startFen: string = START_FEN): ChessState {
  // Throws if the FEN is invalid.
  const chess = new Chess(startFen);
  return { startFen, fen: chess.fen(), moves: [] };
}

/** Rebuild a chess.js instance with full history (needed for repetition). */
function replay(state: ChessState): Chess {
  const chess = new Chess(state.startFen);
  for (const m of state.moves) {
    chess.move({ from: m.from, to: m.to, promotion: m.promotion });
  }
  return chess;
}

export function turn(state: ChessState): Color {
  return state.fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

export function getBoard(state: ChessState): (BoardPiece | null)[][] {
  return new Chess(state.fen).board().map((rank) =>
    rank.map((p) => (p ? { square: p.square, type: p.type, color: p.color } : null)),
  );
}

/** All legal moves, optionally only those starting on `from`. */
export function legalMoves(state: ChessState, from?: Square): LegalMove[] {
  const chess = new Chess(state.fen);
  const verbose = from ? chess.moves({ square: from, verbose: true }) : chess.moves({ verbose: true });
  return verbose.map((m) => ({
    from: m.from,
    to: m.to,
    promotion: m.promotion as PromotionPiece | undefined,
    san: m.san,
    captured: m.captured,
  }));
}

/** Distinct destination squares for the piece on `from`. */
export function legalTargets(state: ChessState, from: Square): Square[] {
  return [...new Set(legalMoves(state, from).map((m) => m.to))];
}

/** True if moving from -> to is a pawn move that requires choosing a promotion piece. */
export function needsPromotion(state: ChessState, from: Square, to: Square): boolean {
  return legalMoves(state, from).some((m) => m.to === to && m.promotion !== undefined);
}

export function validateMove(state: ChessState, move: ChessMove): MoveResult {
  const status = getStatus(state);
  if (status.kind !== 'playing') return { ok: false, reason: 'The game is over' };
  const candidates = legalMoves(state, move.from).filter((m) => m.to === move.to);
  if (candidates.length === 0) return { ok: false, reason: 'Illegal move' };
  if (candidates.some((m) => m.promotion !== undefined)) {
    if (!move.promotion) return { ok: false, reason: 'Promotion piece required' };
    if (!candidates.some((m) => m.promotion === move.promotion)) {
      return { ok: false, reason: 'Invalid promotion piece' };
    }
  } else if (move.promotion) {
    return { ok: false, reason: 'This move is not a promotion' };
  }
  return { ok: true };
}

/** Pure: returns a new state. Throws on an illegal move. */
export function applyMove(state: ChessState, move: ChessMove): ChessState {
  const result = validateMove(state, move);
  if (!result.ok) throw new Error(result.reason);
  const chess = new Chess(state.fen);
  const played = chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  const record: MoveRecord = {
    from: played.from,
    to: played.to,
    promotion: played.promotion as PromotionPiece | undefined,
    san: played.san,
    color: played.color,
    piece: played.piece,
    captured: played.captured,
  };
  return { startFen: state.startFen, fen: chess.fen(), moves: [...state.moves, record] };
}

export function getStatus(state: ChessState): GameStatus {
  const chess = replay(state);
  if (chess.isCheckmate()) {
    // The side to move is the one that has been mated.
    return { kind: 'checkmate', winner: chess.turn() === 'w' ? 'b' : 'w' };
  }
  if (chess.isStalemate()) return { kind: 'draw', reason: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { kind: 'draw', reason: 'insufficient-material' };
  if (chess.isThreefoldRepetition()) return { kind: 'draw', reason: 'threefold-repetition' };
  if (chess.isDrawByFiftyMoves()) return { kind: 'draw', reason: 'fifty-move' };
  return { kind: 'playing', check: chess.inCheck() };
}

/** Square of the king for `color`, or null. */
export function kingSquare(state: ChessState, color: Color): Square | null {
  for (const rank of getBoard(state)) {
    for (const p of rank) if (p && p.type === 'k' && p.color === color) return p.square;
  }
  return null;
}