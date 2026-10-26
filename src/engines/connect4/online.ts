import { COLS, applyMove, createGame, getStatus, validateMove, type ConnectFourMove, type ConnectFourState } from './engine';
import { RoomError, type OnlineGameDef, type RoomResult } from '../online/types';

export const connect4Online: OnlineGameDef<ConnectFourState, ConnectFourMove> = {
  id: 'connect4',
  title: 'Connect Four',
  sides: ['r', 'y'],
  sideNames: { r: 'Red', y: 'Yellow' },
  flippable: false,

  createState: () => createGame(),
  turn: (state) => state.turn,

  parseMove(raw) {
    const column = (raw as { column?: unknown } | null)?.column;
    if (typeof column !== 'number' || !Number.isInteger(column) || column < 0 || column >= COLS) {
      throw new RoomError(400, 'Invalid column');
    }
    return { column };
  },

  validateMove,
  applyMove,

  outcome(state): RoomResult | null {
    const status = getStatus(state);
    if (status.kind === 'win') return { winner: status.winner, reason: 'four-in-a-row' };
    if (status.kind === 'draw') return { winner: null, reason: 'board-full' };
    return null;
  },

  notation: (state) => state.moves.map((column) => String(column + 1)),

  note: () => null,

  describeResult(result) {
    return result.winner
      ? `${this.sideNames[result.winner]} wins with four in a row`
      : 'Draw: the board is full';
  },
};
