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
  type Room,
} from '../src/engines/chess/room';
import { remaining } from '../src/engines/chess/clock';
import { turn, type Square } from '../src/engines/chess/engine';

const T0 = 1_000_000;

function twoPlayerRoom(timeControlId = 'untimed') {
  const created = createRoom({ id: 'abcd1234', timeControlId, token: 'tok-w', color: 'w', now: T0 });
  return joinRoom(created, null, 'tok-b').room;
}

function mv(from: Square, to: Square) {
  return { from, to };
}

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

describe('createRoom / joinRoom', () => {
  it('seats the creator and waits for an opponent', () => {
    const room = createRoom({ id: 'abcd1234', timeControlId: '5+0', token: 'tok-b', color: 'b', now: T0 });
    expect(room.seats).toEqual({ w: null, b: 'tok-b' });
    expect(roomStatus(room)).toBe('waiting');
    expect(room.clock.control?.baseMs).toBe(300_000);
  });

  it('rejects an unknown time control', () => {
    expectRoomError(() => createRoom({ id: 'x', timeControlId: 'nope', token: 't', color: 'w', now: T0 }), 400);
  });

  it('gives the joiner the free seat', () => {
    const room = createRoom({ id: 'abcd1234', timeControlId: 'untimed', token: 'tok-b', color: 'b', now: T0 });
    const joined = joinRoom(room, null, 'new-token');
    expect(joined.color).toBe('w');
    expect(joined.token).toBe('new-token');
    expect(roomStatus(joined.room)).toBe('playing');
  });

  it('is idempotent for a token that already has a seat', () => {
    const room = twoPlayerRoom();
    const again = joinRoom(room, 'tok-w', 'ignored');
    expect(again.room).toBe(room);
    expect(again.color).toBe('w');
    expect(again.token).toBe('tok-w');
  });

  it('refuses a third player', () => {
    expectRoomError(() => joinRoom(twoPlayerRoom(), null, 'tok-3'), 409);
  });
});

describe('playMove', () => {
  it('lets the right player move and then switches turns', () => {
    let room = twoPlayerRoom();
    room = playMove(room, 'tok-w', mv('e2', 'e4'), T0 + 10);
    expect(turn(room.game)).toBe('b');
    expect(room.game.moves).toHaveLength(1);
    expect(room.version).toBeGreaterThan(2);
    room = playMove(room, 'tok-b', mv('e7', 'e5'), T0 + 20);
    expect(room.game.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
  });

  it('does not mutate the previous room', () => {
    const room = twoPlayerRoom();
    const next = playMove(room, 'tok-w', mv('e2', 'e4'), T0);
    expect(room.game.moves).toHaveLength(0);
    expect(next).not.toBe(room);
  });

  it('rejects moves out of turn, from strangers and before an opponent joins', () => {
    const room = twoPlayerRoom();
    expectRoomError(() => playMove(room, 'tok-b', mv('e7', 'e5'), T0), 409); // not your turn
    expectRoomError(() => playMove(room, 'stranger', mv('e2', 'e4'), T0), 403);
    expectRoomError(() => playMove(room, null, mv('e2', 'e4'), T0), 403);

    const waiting = createRoom({ id: 'abcd1234', timeControlId: 'untimed', token: 'tok-w', color: 'w', now: T0 });
    expectRoomError(() => playMove(waiting, 'tok-w', mv('e2', 'e4'), T0), 409);
  });

  it('rejects illegal moves and bad promotion data', () => {
    expectRoomError(() => playMove(twoPlayerRoom(), 'tok-w', mv('e2', 'e5'), T0), 422);
    expectRoomError(() => playMove(twoPlayerRoom(), 'tok-w', { from: 'e2', to: 'e4', promotion: 'q' }, T0), 422);
  });

  it("ends the game on checkmate (fool's mate)", () => {
    let room = twoPlayerRoom();
    const line: [string, Square, Square][] = [
      ['tok-w', 'f2', 'f3'],
      ['tok-b', 'e7', 'e5'],
      ['tok-w', 'g2', 'g4'],
      ['tok-b', 'd8', 'h4'],
    ];
    line.forEach(([tok, from, to], i) => {
      room = playMove(room, tok, mv(from, to), T0 + i * 1000);
    });
    expect(room.result).toEqual({ winner: 'b', reason: 'checkmate' });
    expect(roomStatus(room)).toBe('finished');
    expect(describeResult(room.result!)).toBe('Black wins by checkmate');
    expectRoomError(() => playMove(room, 'tok-w', mv('a2', 'a3'), T0 + 9000), 409);
  });
});

describe('clocks', () => {
  it("starts after white's first move and charges thinking time", () => {
    let room = twoPlayerRoom('3+2');
    room = playMove(room, 'tok-w', mv('e2', 'e4'), T0);
    expect(room.clock.running).toBe('b');
    expect(remaining(room.clock, 'w', T0 + 5000)).toBe(180_000); // white untouched
    room = playMove(room, 'tok-b', mv('e7', 'e5'), T0 + 5000); // black thought 5s, +2s increment
    expect(room.clock.blackMs).toBe(180_000 - 5000 + 2000);
    expect(room.clock.running).toBe('w');
  });

  it('settle() ends the game when the running clock hits zero', () => {
    let room = twoPlayerRoom('1+0');
    room = playMove(room, 'tok-w', mv('e2', 'e4'), T0); // black's 60s start
    expect(settle(room, T0 + 59_999)).toBe(room); // unchanged: same object
    const flagged = settle(room, T0 + 60_000);
    expect(flagged.result).toEqual({ winner: 'w', reason: 'timeout' });
    expect(flagged.version).toBe(room.version + 1);
    expect(describeResult(flagged.result!)).toBe('White wins on time');
  });

  it('refuses a move from a player whose time already ran out', () => {
    let room = twoPlayerRoom('1+0');
    room = playMove(room, 'tok-w', mv('e2', 'e4'), T0);
    expectRoomError(() => playMove(room, 'tok-b', mv('e7', 'e5'), T0 + 61_000), 409);
  });

  it('never times out untimed games', () => {
    let room = twoPlayerRoom('untimed');
    room = playMove(room, 'tok-w', mv('e2', 'e4'), T0);
    expect(settle(room, T0 + 10 ** 9)).toBe(room);
  });
});

describe('resign', () => {
  it('gives the win to the opponent', () => {
    const room = resignRoom(twoPlayerRoom(), 'tok-w', T0);
    expect(room.result).toEqual({ winner: 'b', reason: 'resignation' });
    expect(describeResult(room.result!)).toBe('Black wins: White resigned');
  });

  it('only works for players, and only while the game is on', () => {
    const room = twoPlayerRoom();
    expectRoomError(() => resignRoom(room, 'stranger', T0), 403);
    const waiting = createRoom({ id: 'abcd1234', timeControlId: 'untimed', token: 'tok-w', color: 'w', now: T0 });
    expectRoomError(() => resignRoom(waiting, 'tok-w', T0), 409);
    const done = resignRoom(room, 'tok-w', T0);
    expectRoomError(() => resignRoom(done, 'tok-b', T0), 409);
  });
});

describe('toView', () => {
  it('never exposes seat tokens', () => {
    const room = twoPlayerRoom();
    const view = toView(room, T0);
    expect(JSON.stringify(view)).not.toContain('tok-w');
    expect(JSON.stringify(view)).not.toContain('tok-b');
    expect(view.seats).toEqual({ w: true, b: true });
    expect(view.status).toBe('playing');
    expect(view.serverNow).toBe(T0);
  });

  it('seatOf reads tokens correctly', () => {
    const room: Room = twoPlayerRoom();
    expect(seatOf(room, 'tok-w')).toBe('w');
    expect(seatOf(room, 'tok-b')).toBe('b');
    expect(seatOf(room, 'x')).toBeNull();
    expect(seatOf(room, undefined)).toBeNull();
  });
});