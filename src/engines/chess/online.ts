import { RoomError, type OnlineGameDef, type RoomResult } from '../online/types';
import {
  applyMove,
  createGame,
  getStatus,
  turn,
  validateMove,
  type ChessMove,
  type ChessState,
  type DrawReason,
  type PromotionPiece,
  type Square,
} from './engine';

const SQUARE = /^[a-h][1-8]$/;
const PROMOTIONS = ['q', 'r', 'b', 'n'];

const DRAW_TEXT: Record<DrawReason, string> = {
  stalemate: 'Draw by stalemate',
  'insufficient-material': 'Draw: insufficient material',
  'threefold-repetition': 'Draw by threefold repetition',
  'fifty-move': 'Draw by the fifty-move rule',
};

export const chessOnline: OnlineGameDef<ChessState, ChessMove> = {
  id: 'chess',
  title: 'Chess',
  sides: ['w', 'b'],
  sideNames: { w: 'White', b: 'Black' },
  flippable: true,

  createState: () => createGame(),
  turn: (state) => turn(state),

  parseMove(raw) {
    const { from, to, promotion } = (raw ?? {}) as Record<string, unknown>;
    if (typeof from !== 'string' || !SQUARE.test(from) || typeof to !== 'string' || !SQUARE.test(to)) {
      throw new RoomError(400, 'Invalid move');
    }
    if (promotion !== undefined && promotion !== null && !PROMOTIONS.includes(promotion as string)) {
      throw new RoomError(400, 'Invalid promotion piece');
    }
    return {
      from: from as Square,
      to: to as Square,
      ...(promotion ? { promotion: promotion as PromotionPiece } : {}),
    };
  },

  validateMove,
  applyMove,

  outcome(state): RoomResult | null {
    const status = getStatus(state);
    if (status.kind === 'checkmate') return { winner: status.winner, reason: 'checkmate' };
    if (status.kind === 'draw') return { winner: null, reason: status.reason };
    return null;
  },

  notation: (state) => state.moves.map((m) => m.san),

  note(state) {
    const status = getStatus(state);
    return status.kind === 'playing' && status.check ? 'check' : null;
  },

  describeResult(result) {
    if (result.winner && result.reason === 'checkmate') {
      return `${this.sideNames[result.winner]} wins by checkmate`;
    }
    return DRAW_TEXT[result.reason as DrawReason] ?? 'Draw';
  },
};
