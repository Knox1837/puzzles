import { RoomError, type OnlineGameDef, type RoomResult } from '../online/types';
import {
  applyMove,
  createGame,
  getStatus,
  legalMoves,
  validateMove,
  type CheckersMove,
  type CheckersState,
  type Square,
} from './engine';

const SQUARE = /^[a-h][1-8]$/;

export const checkersOnline: OnlineGameDef<CheckersState, CheckersMove> = {
  id: 'checkers',
  title: 'Checkers',
  // Black moves first in English checkers.
  sides: ['b', 'w'],
  sideNames: { b: 'Black', w: 'White' },
  flippable: true,

  createState: () => createGame(),
  turn: (state) => state.turn,

  parseMove(raw) {
    const path = (raw as { path?: unknown } | null)?.path;
    if (
      !Array.isArray(path) ||
      path.length < 2 ||
      path.length > 13 ||
      !path.every((sq) => typeof sq === 'string' && SQUARE.test(sq))
    ) {
      throw new RoomError(400, 'Invalid move');
    }
    return { path: path as Square[] };
  },

  validateMove,
  applyMove,

  outcome(state): RoomResult | null {
    const status = getStatus(state);
    if (status.kind === 'win') return { winner: status.winner, reason: status.reason };
    if (status.kind === 'draw') return { winner: null, reason: status.reason };
    return null;
  },

  notation: (state) => state.moves.map((m) => m.notation),

  note(state) {
    if (getStatus(state).kind !== 'playing') return null;
    const moves = legalMoves(state);
    return moves.length > 0 && moves[0].captures.length > 0 ? 'capture is mandatory' : null;
  },

  describeResult(result) {
    if (result.winner) {
      const loser = this.sideNames[result.winner === 'b' ? 'w' : 'b'];
      return `${this.sideNames[result.winner]} wins: ${loser} ${
        result.reason === 'no-pieces' ? 'has no pieces left' : 'cannot move'
      }`;
    }
    return result.reason === 'repetition'
      ? 'Draw by repetition'
      : 'Draw: 40 moves each without a capture or a man moving';
  },
};
