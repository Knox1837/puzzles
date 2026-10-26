import { describe, it, expect } from 'vitest';
import {
  RoomError,
  createRoom,
  describeResult,
  joinRoom,
  playMove,
  resignRoom,
  roomStatus,
  seatOf,
  settle,
  toView,
  clockSlot,
  type Room,
} from '../src/engines/online/room';
import { getGame } from '../src/engines/online/games';
import { remaining } from '../src/engines/chess/clock';
import { parseBoard as parseCheckers } from '../src/engines/checkers/engine';

const T0 = 1_000_000;

/** Per-game data so the same behaviour is checked for every game. */
const GAMES = [
  {
    id: 'chess',
    first: 'w',
    second: 'b',
    opening: [
      { from: 'e2', to: 'e4' },
      { from: 'e7', to: 'e5' },
    ],
    illegal: { from: 'e2', to: 'e5' },
  },
  {
    id: 'checkers',
    first: 'b',
    second: 'w',
    opening: [{ path: ['c3', 'd4'] }, { path: ['b6', 'a5'] }],
    illegal: { path: ['a1', 'b2'] },
  },
  {
    id: 'connect4',
    first: 'r',
    second: 'y',
    opening: [{ column: 3 }, { column: 3 }],
    illegal: { column: 99 },
  },
];

function expectRoomError(fn: () => unknown, status: number) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(RoomError);
    expect((e as RoomError).status).toBe(status);
    return;
  }
  throw new Error('expected a RoomError');
}

describe.each(GAMES)('shared room rules: $id', ({ id, first, second, opening, illegal }) => {
  const def = getGame(id);
  const waiting = (tc = 'untimed') =>
    createRoom(def, { id: 'room0001', timeControlId: tc, token: 'tok-first', side: first, now: T0 });
  const started = (tc = 'untimed'): Room => joinRoom(def, waiting(tc), null, 'tok-second').room;

  it('seats the creator and waits for an opponent', () => {
    const room = waiting('5+0');
    expect(room.game).toBe(id);
    expect(room.seats).toEqual({ [first]: 'tok-first', [second]: null });
    expect(roomStatus(room)).toBe('waiting');
    expect(room.clock.control?.baseMs).toBe(300_000);
  });

  it('rejects an unknown time control or side', () => {
    expectRoomError(() => createRoom(def, { id: 'x', timeControlId: 'nope', token: 't', side: first, now: T0 }), 400);
    expectRoomError(() => createRoom(def, { id: 'x', timeControlId: 'untimed', token: 't', side: 'zz', now: T0 }), 400);
  });

  it('gives the joiner the free seat, is idempotent, and refuses a third player', () => {
    const joined = joinRoom(def, waiting(), null, 'new-token');
    expect(joined.side).toBe(second);
    expect(joined.token).toBe('new-token');
    expect(roomStatus(joined.room)).toBe('playing');

    const again = joinRoom(def, joined.room, 'new-token', 'ignored');
    expect(again.room).toBe(joined.room);
    expect(again.side).toBe(second);

    expectRoomError(() => joinRoom(def, joined.room, null, 'tok-3'), 409);
  });

  it('lets the first side move, then the second, without mutating old rooms', () => {
    const room = started();
    const after1 = playMove(def, room, 'tok-first', opening[0], T0 + 10);
    expect(def.turn(after1.state)).toBe(second);
    expect(after1.version).toBeGreaterThan(room.version);
    expect(def.notation(room.state)).toHaveLength(0); // original untouched

    const after2 = playMove(def, after1, 'tok-second', opening[1], T0 + 20);
    expect(def.notation(after2.state)).toHaveLength(2);
    expect(def.turn(after2.state)).toBe(first);
  });

  it('rejects out-of-turn moves, strangers, early moves and illegal moves', () => {
    const room = started();
    expectRoomError(() => playMove(def, room, 'tok-second', opening[0], T0), 409); // not your turn
    expectRoomError(() => playMove(def, room, 'stranger', opening[0], T0), 403);
    expectRoomError(() => playMove(def, room, null, opening[0], T0), 403);
    expectRoomError(() => playMove(def, waiting(), 'tok-first', opening[0], T0), 409); // opponent missing
    expectRoomError(() => playMove(def, room, 'tok-first', illegal, T0), 422);
  });

  it('starts the clock after the first move and ends the game on time', () => {
    let room = started('1+0');
    room = playMove(def, room, 'tok-first', opening[0], T0); // the second side's 60 seconds start
    expect(remaining(room.clock, clockSlot(def, first), T0 + 30_000)).toBe(60_000);
    expect(remaining(room.clock, clockSlot(def, second), T0 + 30_000)).toBe(30_000);

    expect(settle(def, room, T0 + 59_999)).toBe(room); // nothing changed: same object
    const flagged = settle(def, room, T0 + 60_000);
    expect(flagged.result).toEqual({ winner: first, reason: 'timeout' });
    expect(flagged.version).toBe(room.version + 1);
    expect(describeResult(def, flagged.result!)).toBe(`${def.sideNames[first]} wins on time`);
    expectRoomError(() => playMove(def, room, 'tok-second', opening[1], T0 + 61_000), 409);
  });

  it('adds the increment after later moves', () => {
    let room = started('3+2');
    room = playMove(def, room, 'tok-first', opening[0], T0);
    room = playMove(def, room, 'tok-second', opening[1], T0 + 5000); // used 5s, gets +2s
    expect(remaining(room.clock, clockSlot(def, second), T0 + 5000)).toBe(180_000 - 5000 + 2000);
  });

  it('never times out untimed games', () => {
    let room = started('untimed');
    room = playMove(def, room, 'tok-first', opening[0], T0);
    expect(settle(def, room, T0 + 10 ** 9)).toBe(room);
  });

  it('supports resigning, for players only and only while playing', () => {
    const room = started();
    const resigned = resignRoom(def, room, 'tok-first', T0);
    expect(resigned.result).toEqual({ winner: second, reason: 'resignation' });
    expect(describeResult(def, resigned.result!)).toBe(
      `${def.sideNames[second]} wins: ${def.sideNames[first]} resigned`,
    );
    expectRoomError(() => resignRoom(def, room, 'stranger', T0), 403);
    expectRoomError(() => resignRoom(def, waiting(), 'tok-first', T0), 409);
    expectRoomError(() => resignRoom(def, resigned, 'tok-second', T0), 409);
  });

  it('never exposes seat tokens in the public view', () => {
    const view = toView(started(), T0);
    expect(JSON.stringify(view)).not.toMatch(/tok-/);
    expect(view.seats).toEqual({ [first]: true, [second]: true });
    expect(view.status).toBe('playing');
    expect(view.game).toBe(id);
    expect(view.serverNow).toBe(T0);
  });

  it('finds seats by token', () => {
    const room = started();
    expect(seatOf(room, 'tok-first')).toBe(first);
    expect(seatOf(room, 'tok-second')).toBe(second);
    expect(seatOf(room, 'x')).toBeNull();
    expect(seatOf(room, undefined)).toBeNull();
  });
});

describe('chess specifics', () => {
  const def = getGame('chess');
  const base = joinRoom(def, createRoom(def, { id: 'room0001', timeControlId: 'untimed', token: 'a', side: 'w', now: T0 }), null, 'b').room;

  it("ends on checkmate (fool's mate)", () => {
    const line: [string, string, string][] = [
      ['a', 'f2', 'f3'],
      ['b', 'e7', 'e5'],
      ['a', 'g2', 'g4'],
      ['b', 'd8', 'h4'],
    ];
    let room = base;
    line.forEach(([tok, from, to], i) => {
      room = playMove(def, room, tok, { from, to }, T0 + i * 1000);
    });
    expect(room.result).toEqual({ winner: 'b', reason: 'checkmate' });
    expect(describeResult(def, room.result!)).toBe('Black wins by checkmate');
    expect(roomStatus(room)).toBe('finished');
  });

  it('reports check as a position note', () => {
    let room = base;
    for (const [tok, from, to] of [['a', 'e2', 'e4'], ['b', 'f7', 'f6'], ['a', 'd1', 'h5']] as const) {
      room = playMove(def, room, tok, { from, to }, T0);
    }
    expect(def.note(room.state)).toBe('check');
  });

  it('parses and rejects untrusted moves', () => {
    expect(def.parseMove({ from: 'e2', to: 'e4' })).toEqual({ from: 'e2', to: 'e4' });
    expect(def.parseMove({ from: 'a7', to: 'a8', promotion: 'q' })).toEqual({ from: 'a7', to: 'a8', promotion: 'q' });
    for (const bad of [null, {}, { from: 'z9', to: 'e4' }, { from: 'e2' }, { from: 'e2', to: 'e4', promotion: 'k' }, 'e2e4']) {
      expectRoomError(() => def.parseMove(bad), 400);
    }
  });
});

describe('connect4 specifics', () => {
  const def = getGame('connect4');
  const base = joinRoom(def, createRoom(def, { id: 'room0001', timeControlId: 'untimed', token: 'a', side: 'r', now: T0 }), null, 'b').room;

  it('ends when someone connects four', () => {
    let room = base;
    [0, 1, 0, 1, 0, 1, 0].forEach((column, i) => {
      room = playMove(def, room, i % 2 === 0 ? 'a' : 'b', { column }, T0);
    });
    expect(room.result).toEqual({ winner: 'r', reason: 'four-in-a-row' });
    expect(describeResult(def, room.result!)).toBe('Red wins with four in a row');
    expect(def.notation(room.state)).toEqual(['1', '2', '1', '2', '1', '2', '1']);
  });

  it('rejects a full column through the room', () => {
    let room = base;
    for (let i = 0; i < 6; i++) room = playMove(def, room, i % 2 === 0 ? 'a' : 'b', { column: 0 }, T0);
    expectRoomError(() => playMove(def, room, 'a', { column: 0 }, T0), 422);
  });

  it('parses and rejects untrusted moves', () => {
    expect(def.parseMove({ column: 6 })).toEqual({ column: 6 });
    for (const bad of [null, {}, { column: -1 }, { column: 7 }, { column: 1.5 }, { column: '3' }, 3]) {
      expectRoomError(() => def.parseMove(bad), 400);
    }
  });
});

describe('checkers specifics', () => {
  const def = getGame('checkers');
  const base = joinRoom(def, createRoom(def, { id: 'room0001', timeControlId: 'untimed', token: 'a', side: 'b', now: T0 }), null, 'w').room;
  const withBoard = (rows: string[], turn: 'b' | 'w' = 'b'): Room => ({ ...base, state: parseCheckers(rows, turn) });

  it('forces captures through the room and shows a banner note', () => {
    const room = withBoard([
      '........',
      '........',
      '........',
      '........',
      '...w....',
      '..b.....',
      '.......b',
      '........',
    ]);
    expect(def.note(room.state)).toBe('capture is mandatory');
    try {
      playMove(def, room, 'a', { path: ['c3', 'b4'] }, T0);
      throw new Error('should have failed');
    } catch (e) {
      expect((e as RoomError).status).toBe(422);
      expect((e as RoomError).message).toBe('A capture is mandatory');
    }
  });

  it('ends the game when the last piece is captured', () => {
    const room = withBoard([
      '........',
      '........',
      '........',
      '........',
      '...w....',
      '..b.....',
      '........',
      '........',
    ]);
    const done = playMove(def, room, 'a', { path: ['c3', 'e5'] }, T0);
    expect(done.result).toEqual({ winner: 'b', reason: 'no-pieces' });
    expect(describeResult(def, done.result!)).toBe('Black wins: White has no pieces left');
    expect(def.notation(done.state)).toEqual(['c3xe5']);
  });

  it('ends the game when a side cannot move', () => {
    const room = withBoard(
      ['........', '........', '........', '........', '........', '..w.....', '.w......', 'b.......'],
      'w',
    );
    // White to move with a legal move? white men on c3/b2 move down-left/right.
    expect(def.outcome(room.state)).toBeNull();
    const blocked = withBoard(['........', '........', '........', '........', '........', '..w.....', '.w......', 'b.......'], 'b');
    expect(def.outcome(blocked.state)).toEqual({ winner: 'w', reason: 'no-moves' });
    expect(def.describeResult({ winner: 'w', reason: 'no-moves' })).toBe('White wins: Black cannot move');
  });

  it('parses and rejects untrusted moves', () => {
    expect(def.parseMove({ path: ['c3', 'e5', 'g7'] })).toEqual({ path: ['c3', 'e5', 'g7'] });
    for (const bad of [null, {}, { path: [] }, { path: ['c3'] }, { path: ['c3', 'z9'] }, { path: 'c3d4' }, { path: Array(14).fill('c3') }]) {
      expectRoomError(() => def.parseMove(bad), 400);
    }
  });

  it('describes draws', () => {
    expect(def.describeResult({ winner: null, reason: 'repetition' })).toBe('Draw by repetition');
    expect(def.describeResult({ winner: null, reason: 'forty-move' })).toMatch(/^Draw: 40 moves/);
  });
});
