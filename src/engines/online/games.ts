import { chessOnline } from '../chess/online';
import { checkersOnline } from '../checkers/online';
import { connect4Online } from '../connect4/online';
import { RoomError, type OnlineGameDef } from './types';

/** Every game that can be played online. Add new games here. */
export const ONLINE_GAMES: Record<string, OnlineGameDef> = {
  [chessOnline.id]: chessOnline,
  [checkersOnline.id]: checkersOnline,
  [connect4Online.id]: connect4Online,
};

export function findGame(id: unknown): OnlineGameDef | null {
  return typeof id === 'string' && Object.hasOwn(ONLINE_GAMES, id) ? ONLINE_GAMES[id] : null;
}

/** Like findGame, but throws a 400 for unknown ids (used by API routes). */
export function getGame(id: unknown): OnlineGameDef {
  const game = findGame(id);
  if (!game) throw new RoomError(400, 'Unknown game');
  return game;
}
