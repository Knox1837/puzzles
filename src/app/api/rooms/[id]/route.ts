import { RoomError, joinRoom, playMove, resignRoom, settle, toView } from '@/engines/online/room';
import { getGame } from '@/engines/online/games';
import { ROOM_ID_PATTERN, newToken } from '@/lib/ids';
import { getStore, updateRoom } from '@/lib/roomStore';
import { errorResponse, json, readJson } from '@/lib/http';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function roomId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!ROOM_ID_PATTERN.test(id)) throw new RoomError(404, 'Game not found');
  return id;
}

/**
 * Poll for the current state. Pass ?v=<version you have>; if nothing changed
 * you get a tiny { unchanged: true } reply. Also ends the game on time if a
 * clock has run out.
 */
export async function GET(req: Request, ctx: Ctx) {
  try {
    const id = await roomId(ctx);
    const store = await getStore();
    const now = Date.now();

    const room = await updateRoom(store, id, (r) => settle(getGame(r.game), r, now));
    if (!room) throw new RoomError(404, 'Game not found');

    const since = Number(new URL(req.url).searchParams.get('v'));
    if (Number.isInteger(since) && since === room.version) {
      return json({ unchanged: true, version: room.version, serverNow: now });
    }
    return json(toView(room, now));
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Body: { action: 'join' | 'move' | 'resign', token?, move? }
 * `move` is the game's own move shape, e.g. { from, to } for chess or { column } for Connect Four.
 * Always replies { view, ... } with the new state.
 */
export async function POST(req: Request, ctx: Ctx) {
  try {
    const id = await roomId(ctx);
    const body = await readJson(req);
    const store = await getStore();
    const now = Date.now();
    const token = typeof body.token === 'string' ? body.token : null;

    let room;
    const joined: { side?: string; token?: string } = {};

    switch (body.action) {
      case 'join': {
        const fresh = newToken();
        room = await updateRoom(store, id, (r) => {
          const res = joinRoom(getGame(r.game), r, token, fresh);
          joined.side = res.side;
          joined.token = res.token;
          return res.room;
        });
        break;
      }
      case 'move': {
        room = await updateRoom(store, id, (r) => {
          const def = getGame(r.game);
          return playMove(def, r, token, def.parseMove(body.move), now);
        });
        break;
      }
      case 'resign': {
        room = await updateRoom(store, id, (r) => resignRoom(getGame(r.game), r, token, now));
        break;
      }
      default:
        throw new RoomError(400, 'Unknown action');
    }

    if (!room) throw new RoomError(404, 'Game not found');
    return json({ view: toView(room, now), ...joined });
  } catch (e) {
    return errorResponse(e);
  }
}
