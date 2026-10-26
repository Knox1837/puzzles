import { createRoom, toView, RoomError } from '@/engines/online/room';
import { getGame } from '@/engines/online/games';
import { newRoomId, newToken } from '@/lib/ids';
import { getStore } from '@/lib/roomStore';
import { errorResponse, json, readJson } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * Create a game. Body: { game: 'chess' | 'checkers' | 'connect4', timeControlId?: string,
 * side?: <a side id of that game> | 'random' }
 */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const def = getGame(body.game);
    const timeControlId = typeof body.timeControlId === 'string' ? body.timeControlId : 'untimed';
    const side =
      typeof body.side === 'string' && def.sides.includes(body.side)
        ? body.side
        : def.sides[Math.random() < 0.5 ? 0 : 1];

    const store = await getStore();
    const token = newToken();
    const now = Date.now();

    for (let attempt = 0; attempt < 5; attempt++) {
      const room = createRoom(def, { id: newRoomId(), timeControlId, token, side, now });
      if (await store.create(room)) {
        return json({ id: room.id, token, side, view: toView(room, now) }, 201);
      }
    }
    throw new RoomError(503, 'Could not create a game, please try again');
  } catch (e) {
    return errorResponse(e);
  }
}
