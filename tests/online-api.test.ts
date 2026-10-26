import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST as createRoute } from '../src/app/api/rooms/route';
import { GET as getRoom, POST as roomAction } from '../src/app/api/rooms/[id]/route';
import { MemoryRoomStore, setStore } from '../src/lib/roomStore';

const BASE = 'http://localhost/api/rooms';
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

/** Create a game and have a second player join. */
async function startGame(game: string, side?: string, timeControlId?: string) {
  const created = await createGame({ game, side, timeControlId });
  const id = created.body.id as string;
  const joined = await act(id, { action: 'join' });
  return {
    id,
    tokens: { [created.body.side as string]: created.body.token as string, [joined.body.side as string]: joined.body.token as string },
    created,
    joined,
  };
}

beforeEach(() => setStore(new MemoryRoomStore()));
afterEach(() => {
  setStore(undefined);
  vi.useRealTimers();
});

describe('creating games', () => {
  it.each([
    ['chess', ['w', 'b']],
    ['checkers', ['b', 'w']],
    ['connect4', ['r', 'y']],
  ])('creates a %s game with the chosen side', async (game, sides) => {
    const { status, body } = await createGame({ game, side: sides[1], timeControlId: '5+0' });
    expect(status).toBe(201);
    expect(body.id).toMatch(/^[a-z0-9]{8}$/);
    expect(body.side).toBe(sides[1]);
    expect(body.view.game).toBe(game);
    expect(body.view.status).toBe('waiting');
    expect(body.view.seats).toEqual({ [sides[0]]: false, [sides[1]]: true });
    expect(JSON.stringify(body.view)).not.toContain(body.token);
  });

  it('picks a side for "random" or a missing side', async () => {
    const random = await createGame({ game: 'connect4', side: 'random' });
    expect(['r', 'y']).toContain(random.body.side);
    const none = await createGame({ game: 'checkers' });
    expect(['b', 'w']).toContain(none.body.side);
  });

  it('rejects unknown games, sides from another game and bad time controls', async () => {
    expect((await createGame({ game: 'go' })).status).toBe(400);
    expect((await createGame({})).status).toBe(400);
    expect((await createGame({ game: 'chess', timeControlId: 'bogus' })).status).toBe(400);
    const wrongSide = await createGame({ game: 'chess', side: 'r' }); // red is a Connect Four side
    expect(['w', 'b']).toContain(wrongSide.body.side);
  });
});

describe('playing through the API', () => {
  it("plays chess to checkmate (fool's mate)", async () => {
    const { id, tokens } = await startGame('chess', 'w');
    const line: [string, string, string][] = [
      [tokens.w, 'f2', 'f3'],
      [tokens.b, 'e7', 'e5'],
      [tokens.w, 'g2', 'g4'],
      [tokens.b, 'd8', 'h4'],
    ];
    let last;
    for (const [token, from, to] of line) {
      last = await act(id, { action: 'move', token, move: { from, to } });
      expect(last.status).toBe(200);
    }
    expect(last!.body.view.status).toBe('finished');
    expect(last!.body.view.result).toEqual({ winner: 'b', reason: 'checkmate' });
    expect((await poll(id)).body.state.moves).toHaveLength(4);
    expect((await act(id, { action: 'move', token: tokens.w, move: { from: 'a2', to: 'a3' } })).status).toBe(409);
  });

  it('plays Connect Four to a win', async () => {
    const { id, tokens } = await startGame('connect4', 'r');
    const columns = [0, 1, 0, 1, 0, 1, 0];
    let last;
    for (let i = 0; i < columns.length; i++) {
      const token = i % 2 === 0 ? tokens.r : tokens.y;
      last = await act(id, { action: 'move', token, move: { column: columns[i] } });
      expect(last.status).toBe(200);
    }
    expect(last!.body.view.result).toEqual({ winner: 'r', reason: 'four-in-a-row' });
  });

  it('plays checkers with a forced capture', async () => {
    const { id, tokens } = await startGame('checkers', 'b');
    const move = (token: string, path: string[]) => act(id, { action: 'move', token, move: { path } });

    expect((await move(tokens.b, ['c3', 'd4'])).status).toBe(200);
    expect((await move(tokens.w, ['b6', 'a5'])).status).toBe(200);
    expect((await move(tokens.b, ['d4', 'c5'])).status).toBe(200);

    // White must capture with d6; an ordinary move is refused with the reason.
    const refused = await move(tokens.w, ['a5', 'b4']);
    expect(refused.status).toBe(422);
    expect(refused.body.error).toBe('A capture is mandatory');

    const capture = await move(tokens.w, ['d6', 'b4']);
    expect(capture.status).toBe(200);
    expect(capture.body.view.state.moves.map((m: { notation: string }) => m.notation)).toEqual([
      'c3-d4',
      'b6-a5',
      'd4-c5',
      'd6xb4',
    ]);
  });

  it('supports resigning in any game', async () => {
    const { id, tokens } = await startGame('checkers', 'b');
    const res = await act(id, { action: 'resign', token: tokens.b });
    expect(res.body.view.result).toEqual({ winner: 'w', reason: 'resignation' });
  });

  it('lets a player rejoin with their token and blocks a third person', async () => {
    const { id, joined } = await startGame('connect4', 'r');
    const again = await act(id, { action: 'join', token: joined.body.token });
    expect(again.status).toBe(200);
    expect(again.body.side).toBe('y');
    expect(again.body.token).toBe(joined.body.token);
    expect((await act(id, { action: 'join' })).status).toBe(409);
  });

  it('enforces turns, ownership and move formats', async () => {
    const { id, tokens } = await startGame('connect4', 'r');
    expect((await act(id, { action: 'move', token: tokens.y, move: { column: 3 } })).status).toBe(409); // not your turn
    expect((await act(id, { action: 'move', token: 'forged', move: { column: 3 } })).status).toBe(403);
    expect((await act(id, { action: 'move', token: tokens.r, move: { column: 9 } })).status).toBe(400);
    expect((await act(id, { action: 'move', token: tokens.r, move: 'nope' })).status).toBe(400);
    // A move shaped for another game is rejected before it can do anything.
    expect((await act(id, { action: 'move', token: tokens.r, move: { from: 'e2', to: 'e4' } })).status).toBe(400);
    expect((await act(id, { action: 'move', token: tokens.r, move: { column: 3 } })).status).toBe(200);
  });
});

describe('polling', () => {
  it('returns a tiny reply when nothing changed', async () => {
    const { body: created } = await createGame({ game: 'chess' });
    const id = created.id as string;

    const first = await poll(id);
    expect(first.body.version).toBe(created.view.version);

    const same = await poll(id, first.body.version);
    expect(same.body.unchanged).toBe(true);
    expect(same.body.state).toBeUndefined();

    await act(id, { action: 'join' });
    const changed = await poll(id, first.body.version);
    expect(changed.body.unchanged).toBeUndefined();
    expect(changed.body.status).toBe('playing');
  });

  it('ends a game on time when someone polls after a clock runs out', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);

    const { id, tokens } = await startGame('checkers', 'b', '1+0');
    await act(id, { action: 'move', token: tokens.b, move: { path: ['c3', 'd4'] } }); // White's clock starts

    vi.setSystemTime(1_000_000 + 61_000);
    const state = await poll(id);
    expect(state.body.status).toBe('finished');
    expect(state.body.result).toEqual({ winner: 'b', reason: 'timeout' });
  });
});

describe('bad requests', () => {
  it('rejects malformed input', async () => {
    const { id, tokens } = await startGame('chess', 'w');
    expect((await act(id, { action: 'move', token: tokens.w, move: { from: 'z9', to: 'e4' } })).status).toBe(400);
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
