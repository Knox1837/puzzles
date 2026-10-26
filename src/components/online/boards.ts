import type { ComponentType } from 'react';
import ChessOnlineBoard from './ChessOnlineBoard';
import CheckersOnlineBoard from './CheckersOnlineBoard';
import ConnectFourOnlineBoard from './ConnectFourOnlineBoard';
import type { OnlineBoardProps } from './types';

/** The board component for each online game, keyed by game id. Add new games here. */
export const BOARDS: Record<string, ComponentType<OnlineBoardProps>> = {
  chess: ChessOnlineBoard,
  checkers: CheckersOnlineBoard,
  connect4: ConnectFourOnlineBoard,
};
