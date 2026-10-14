import {
  RoomError,
  joinRoom,
  playMove,
  resignRoom,
  settle,
  toView,
} from '@/engines/chess/room';
import type { ChessMove, Color, PromotionPiece, Square } from '@/engines/chess/engine';
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

    const room = await updateRoom(store, id, (r) => settle(r, now));
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

const SQUARE = /^[a-h][1-8]$/;

function parseMove(body: Record<string, unknown>): ChessMove {
  const { from, to, promotion } = body;
  if (typeof from !== 'string' || !SQUARE.test(from) || typeof to !== 'string' || !SQUARE.test(to)) {
    throw new RoomError(400, 'Invalid move');
  }
  if (promotion !== undefined && promotion !== null && !['q', 'r', 'b', 'n'].includes(promotion as string)) {
    throw new RoomError(400, 'Invalid promotion piece');
  }
  return {
    from: from as Square,
    to: to as Square,
    ...(promotion ? { promotion: promotion as PromotionPiece } : {}),
  };
}

/**
 * Body: { action: 'join' | 'move' | 'resign', token?, from?, to?, promotion? }
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
    const joined: { color?: Color; token?: string } = {};

    switch (body.action) {
      case 'join': {
        const fresh = newToken();
        room = await updateRoom(store, id, (r) => {
          const res = joinRoom(r, token, fresh);
          joined.color = res.color;
          joined.token = res.token;
          return res.room;
        });
        break;
      }
      case 'move': {
        const move = parseMove(body);
        room = await updateRoom(store, id, (r) => playMove(r, token, move, now));
        break;
      }
      case 'resign': {
        room = await updateRoom(store, id, (r) => resignRoom(r, token, now));
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