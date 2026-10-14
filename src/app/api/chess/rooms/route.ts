import { createRoom, toView, RoomError } from '@/engines/chess/room';
import type { Color } from '@/engines/chess/engine';
import { newRoomId, newToken } from '@/lib/ids';
import { getStore } from '@/lib/roomStore';
import { errorResponse, json, readJson } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Create a game. Body: { timeControlId?: string, color?: 'w' | 'b' | 'random' } */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const timeControlId = typeof body.timeControlId === 'string' ? body.timeControlId : 'untimed';
    const color: Color =
      body.color === 'w' || body.color === 'b' ? body.color : Math.random() < 0.5 ? 'w' : 'b';

    const store = await getStore();
    const token = newToken();
    const now = Date.now();

    for (let attempt = 0; attempt < 5; attempt++) {
      const room = createRoom({ id: newRoomId(), timeControlId, token, color, now });
      if (await store.create(room)) {
        return json({ id: room.id, token, color, view: toView(room, now) }, 201);
      }
    }
    throw new RoomError(503, 'Could not create a game, please try again');
  } catch (e) {
    return errorResponse(e);
  }
}