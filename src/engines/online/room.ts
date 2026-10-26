import { TIME_CONTROLS, createClock, flagged, press, stop, type ClockState } from '../chess/clock';
import { RoomError, type OnlineGameDef, type RoomResult } from './types';

export { RoomError };
export type { OnlineGameDef, RoomResult };

/** Full server-side record. `seats` holds secret tokens and is never sent to clients. */
export interface Room {
  id: string;
  /** Which game this room plays, e.g. "chess". */
  game: string;
  /** Increments on every change; used for polling and compare-and-set writes. */
  version: number;
  createdAt: number;
  timeControlId: string;
  /** side id -> secret token of the player sitting there (or null). */
  seats: Record<string, string | null>;
  state: unknown;
  /** The clock calls the side that moves first "w" and the other "b" (see clockSlot). */
  clock: ClockState;
  result: RoomResult | null;
}

export type RoomStatus = 'waiting' | 'playing' | 'finished';

/** What clients are allowed to see. */
export interface RoomView {
  id: string;
  game: string;
  version: number;
  serverNow: number;
  timeControlId: string;
  status: RoomStatus;
  seats: Record<string, boolean>;
  state: unknown;
  clock: ClockState;
  result: RoomResult | null;
}

type Def = OnlineGameDef;

/** Which clock slot belongs to a side: the first mover is "w", the other "b". */
export const clockSlot = (def: Def, side: string): 'w' | 'b' => (side === def.sides[0] ? 'w' : 'b');
const sideForSlot = (def: Def, slot: 'w' | 'b'): string => (slot === 'w' ? def.sides[0] : def.sides[1]);
export const otherSide = (def: Def, side: string): string =>
  side === def.sides[0] ? def.sides[1] : def.sides[0];

export function createRoom(
  def: Def,
  opts: { id: string; timeControlId: string; token: string; side: string; now: number },
): Room {
  const tc = TIME_CONTROLS.find((t) => t.id === opts.timeControlId);
  if (!tc) throw new RoomError(400, 'Unknown time control');
  if (!def.sides.includes(opts.side)) throw new RoomError(400, 'Unknown side');

  const seats: Record<string, string | null> = { [def.sides[0]]: null, [def.sides[1]]: null };
  seats[opts.side] = opts.token;

  return {
    id: opts.id,
    game: def.id,
    version: 1,
    createdAt: opts.now,
    timeControlId: tc.id,
    seats,
    state: def.createState(),
    clock: createClock(tc.control),
    result: null,
  };
}

export function seatOf(room: Room, token: string | null | undefined): string | null {
  if (!token) return null;
  for (const [side, seatToken] of Object.entries(room.seats)) {
    if (seatToken === token) return side;
  }
  return null;
}

export function roomStatus(room: Room): RoomStatus {
  if (room.result) return 'finished';
  return Object.values(room.seats).every((t) => t !== null) ? 'playing' : 'waiting';
}

/**
 * Take a free seat. If `existingToken` already holds a seat, return it
 * unchanged (so refreshing or re-joining is safe).
 */
export function joinRoom(
  def: Def,
  room: Room,
  existingToken: string | null,
  newToken: string,
): { room: Room; side: string; token: string } {
  const existing = seatOf(room, existingToken);
  if (existing && existingToken) return { room, side: existing, token: existingToken };

  const side = def.sides.find((s) => !room.seats[s]);
  if (!side) throw new RoomError(409, 'This game already has two players');

  return {
    room: { ...room, version: room.version + 1, seats: { ...room.seats, [side]: newToken } },
    side,
    token: newToken,
  };
}

/** If a running clock has hit zero, end the game on time. Returns the same object if nothing changed. */
export function settle(def: Def, room: Room, now: number): Room {
  if (room.result) return room;
  const loserSlot = flagged(room.clock, now);
  if (!loserSlot) return room;
  const loser = sideForSlot(def, loserSlot);
  return {
    ...room,
    version: room.version + 1,
    clock: stop(room.clock, now),
    result: { winner: otherSide(def, loser), reason: 'timeout' },
  };
}

function requirePlayer(room: Room, token: string | null): string {
  const side = seatOf(room, token);
  if (!side) throw new RoomError(403, 'You are not a player in this game');
  if (!Object.values(room.seats).every((t) => t !== null)) {
    throw new RoomError(409, 'Waiting for an opponent to join');
  }
  return side;
}

export function playMove(def: Def, room: Room, token: string | null, move: unknown, now: number): Room {
  const current = settle(def, room, now);
  if (current.result) throw new RoomError(409, 'The game is over');
  const side = requirePlayer(current, token);
  if (def.turn(current.state) !== side) throw new RoomError(409, 'It is not your turn');

  const check = def.validateMove(current.state, move);
  if (!check.ok) throw new RoomError(422, check.reason ?? 'Illegal move');

  const state = def.applyMove(current.state, move);
  let clock = press(current.clock, clockSlot(def, side), now);
  const result = def.outcome(state);
  if (result) clock = stop(clock, now);

  return { ...current, version: current.version + 1, state, clock, result };
}

export function resignRoom(def: Def, room: Room, token: string | null, now: number): Room {
  const current = settle(def, room, now);
  if (current.result) throw new RoomError(409, 'The game is over');
  const side = requirePlayer(current, token);
  return {
    ...current,
    version: current.version + 1,
    clock: stop(current.clock, now),
    result: { winner: otherSide(def, side), reason: 'resignation' },
  };
}

export function toView(room: Room, now: number): RoomView {
  return {
    id: room.id,
    game: room.game,
    version: room.version,
    serverNow: now,
    timeControlId: room.timeControlId,
    status: roomStatus(room),
    seats: Object.fromEntries(Object.entries(room.seats).map(([side, t]) => [side, t !== null])),
    state: room.state,
    clock: room.clock,
    result: room.result,
  };
}

/** Human-readable result. Resignation and timeout are shared; the rest comes from the game. */
export function describeResult(def: Def, result: RoomResult): string {
  if (result.winner && result.reason === 'resignation') {
    return `${def.sideNames[result.winner]} wins: ${def.sideNames[otherSide(def, result.winner)]} resigned`;
  }
  if (result.winner && result.reason === 'timeout') {
    return `${def.sideNames[result.winner]} wins on time`;
  }
  return def.describeResult(result);
}
