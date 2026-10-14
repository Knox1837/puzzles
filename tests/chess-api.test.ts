import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST as createRoute } from '../src/app/api/chess/rooms/route';
import { GET as getRoom, POST as roomAction } from '../src/app/api/chess/rooms/[id]/route';
import { MemoryRoomStore, setStore } from '../src/lib/roomStore';

const BASE = 'http://localhost/api/chess/rooms';
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function read(res: Response) {
  return { status: res.status, body: await res.json() };
}

const createGame = async (body: object = {}) =>
  read(await createRoute(new Request(BASE, { method: 'POST', body: JSON.stringify(body) })));

const act = async (id: string, body: object) =>
  read(await roomAction(new Request(`${BASE}/${id}`, { method: 'POST', body: JSON.stringify(body) }), ctx(id)));

const poll = async (id: string, since?: number) =>
  read(await getRoom(new Request(`${BASE}/${id}${since === undefined ? '' : `?v=${since}`}`), ctx(id)));

beforeEach(() => setStore(new MemoryRoomStore()));
afterEach(() => {
  setStore(undefined);
  vi.useRealTimers();
});

describe('creating a game', () => {
  it('returns an id, a secret token and the creator colour', async () => {
    const { status, body } = await createGame({ color: 'b', timeControlId: '5+0' });
    expect(status).toBe(201);
    expect(body.id).toMatch(/^[a-z0-9]{8}$/);
    expect(body.color).toBe('b');
    expect(typeof body.token).toBe('string');
    expect(body.view.status).toBe('waiting');
    expect(body.view.seats).toEqual({ w: false, b: true });
    expect(JSON.stringify(body.view)).not.toContain(body.token);
  });

  it('picks a colour when asked for random and rejects bad time controls', async () => {
    const { body } = await createGame({ color: 'random' });
    expect(['w', 'b']).toContain(body.color);
    expect((await createGame({ timeControlId: 'bogus' })).status).toBe(400);
  });
});

describe('playing a full game through the API', () => {
  it("plays fool's mate between two players", async () => {
    const created = await createGame({ color: 'w' });
    const id = created.body.id as string;
    const white = created.body.token as string;

    const joined = await act(id, { action: 'join' });
    expect(joined.status).toBe(200);
    expect(joined.body.color).toBe('b');
    const black = joined.body.token as string;
    expect(joined.body.view.status).toBe('playing');

    const moves: [string, string, string][] = [
      [white, 'f2', 'f3'],
      [black, 'e7', 'e5'],
      [white, 'g2', 'g4'],
      [black, 'd8', 'h4'],
    ];
    let last;
    for (const [token, from, to] of moves) {
      last = await act(id, { action: 'move', token, from, to });
      expect(last.status).toBe(200);
    }
    expect(last!.body.view.status).toBe('finished');
    expect(last!.body.view.result).toEqual({ winner: 'b', reason: 'checkmate' });

    const state = await poll(id);
    expect(state.body.result.reason).toBe('checkmate');
    expect(state.body.game.moves).toHaveLength(4);

    const more = await act(id, { action: 'move', token: white, from: 'a2', to: 'a3' });
    expect(more.status).toBe(409);
  });

  it('lets a player rejoin with their token, and blocks a third person', async () => {
    const { body: created } = await createGame({ color: 'w' });
    const id = created.id as string;
    const joined = await act(id, { action: 'join' });
    const again = await act(id, { action: 'join', token: joined.body.token });
    expect(again.status).toBe(200);
    expect(again.body.color).toBe('b');
    expect(again.body.token).toBe(joined.body.token);

    const third = await act(id, { action: 'join' });
    expect(third.status).toBe(409);
  });

  it('enforces turns and ownership', async () => {
    const { body: created } = await createGame({ color: 'w' });
    const id = created.id as string;

    // Opponent has not joined yet.
    expect((await act(id, { action: 'move', token: created.token, from: 'e2', to: 'e4' })).status).toBe(409);

    const joined = await act(id, { action: 'join' });
    const black = joined.body.token as string;

    expect((await act(id, { action: 'move', token: black, from: 'e7', to: 'e5' })).status).toBe(409); // not your turn
    expect((await act(id, { action: 'move', token: 'forged', from: 'e2', to: 'e4' })).status).toBe(403);
    expect((await act(id, { action: 'move', token: created.token, from: 'e2', to: 'e5' })).status).toBe(422);
    expect((await act(id, { action: 'move', token: created.token, from: 'e2', to: 'e4' })).status).toBe(200);
  });

  it('supports resigning', async () => {
    const { body: created } = await createGame({ color: 'w' });
    const id = created.id as string;
    await act(id, { action: 'join' });
    const res = await act(id, { action: 'resign', token: created.token });
    expect(res.body.view.result).toEqual({ winner: 'b', reason: 'resignation' });
  });
});

describe('polling', () => {
  it('returns a tiny reply when nothing changed', async () => {
    const { body: created } = await createGame();
    const id = created.id as string;

    const first = await poll(id);
    expect(first.body.version).toBe(created.view.version);

    const same = await poll(id, first.body.version);
    expect(same.body.unchanged).toBe(true);
    expect(same.body.game).toBeUndefined();

    await act(id, { action: 'join' });
    const changed = await poll(id, first.body.version);
    expect(changed.body.unchanged).toBeUndefined();
    expect(changed.body.status).toBe('playing');
  });

  it('ends the game on time when someone polls after a clock runs out', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);

    const { body: created } = await createGame({ color: 'w', timeControlId: '1+0' });
    const id = created.id as string;
    await act(id, { action: 'join' });
    await act(id, { action: 'move', token: created.token, from: 'e2', to: 'e4' }); // black's clock starts

    vi.setSystemTime(1_000_000 + 61_000);
    const state = await poll(id);
    expect(state.body.status).toBe('finished');
    expect(state.body.result).toEqual({ winner: 'w', reason: 'timeout' });
  });
});

describe('bad requests', () => {
  it('rejects malformed input', async () => {
    const { body: created } = await createGame();
    const id = created.id as string;
    await act(id, { action: 'join' });

    expect((await act(id, { action: 'move', token: created.token, from: 'z9', to: 'e4' })).status).toBe(400);
    expect((await act(id, { action: 'move', token: created.token, from: 'e2', to: 'e4', promotion: 'k' })).status).toBe(400);
    expect((await act(id, { action: 'dance' })).status).toBe(400);

    const badJson = await roomAction(new Request(`${BASE}/${id}`, { method: 'POST', body: '{nope' }), ctx(id));
    expect(badJson.status).toBe(400);
  });

  it('returns 404 for unknown or malformed room ids', async () => {
    expect((await poll('zzzzzzzz')).status).toBe(404);
    expect((await poll('../etc')).status).toBe(404);
    expect((await act('zzzzzzzz', { action: 'join' })).status).toBe(404);
  });
});