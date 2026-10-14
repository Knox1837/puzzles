import {
  applyMove,
  createGame,
  getStatus,
  turn,
  validateMove,
  type ChessMove,
  type ChessState,
  type Color,
  type DrawReason,
} from './engine';
import { TIME_CONTROLS, createClock, flagged, press, stop, type ClockState } from './clock';

/** Error with an HTTP status, so API routes can map it straight to a response. */
export class RoomError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'RoomError';
    this.status = status;
  }
}

export type ResultReason = 'checkmate' | 'resignation' | 'timeout' | DrawReason;

export interface RoomResult {
  winner: Color | null;
  reason: ResultReason;
}

/** Full server-side record. `seats` holds secret tokens and is never sent to clients. */
export interface Room {
  id: string;
  /** Increments on every change; used for polling and compare-and-set writes. */
  version: number;
  createdAt: number;
  timeControlId: string;
  seats: { w: string | null; b: string | null };
  game: ChessState;
  clock: ClockState;
  result: RoomResult | null;
}

export type RoomStatus = 'waiting' | 'playing' | 'finished';

/** What clients are allowed to see. */
export interface RoomView {
  id: string;
  version: number;
  serverNow: number;
  timeControlId: string;
  status: RoomStatus;
  seats: { w: boolean; b: boolean };
  game: ChessState;
  clock: ClockState;
  result: RoomResult | null;
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };

export function createRoom(opts: {
  id: string;
  timeControlId: string;
  token: string;
  color: Color;
  now: number;
}): Room {
  const tc = TIME_CONTROLS.find((t) => t.id === opts.timeControlId);
  if (!tc) throw new RoomError(400, 'Unknown time control');
  return {
    id: opts.id,
    version: 1,
    createdAt: opts.now,
    timeControlId: tc.id,
    seats: {
      w: opts.color === 'w' ? opts.token : null,
      b: opts.color === 'b' ? opts.token : null,
    },
    game: createGame(),
    clock: createClock(tc.control),
    result: null,
  };
}

export function seatOf(room: Room, token: string | null | undefined): Color | null {
  if (!token) return null;
  if (room.seats.w === token) return 'w';
  if (room.seats.b === token) return 'b';
  return null;
}

export function roomStatus(room: Room): RoomStatus {
  if (room.result) return 'finished';
  return room.seats.w && room.seats.b ? 'playing' : 'waiting';
}

/**
 * Take a free seat. If `existingToken` already holds a seat, return it
 * unchanged (so refreshing or re-joining is safe).
 */
export function joinRoom(
  room: Room,
  existingToken: string | null,
  newToken: string,
): { room: Room; color: Color; token: string } {
  const existing = seatOf(room, existingToken);
  if (existing && existingToken) return { room, color: existing, token: existingToken };

  const color: Color | null = !room.seats.w ? 'w' : !room.seats.b ? 'b' : null;
  if (!color) throw new RoomError(409, 'This game already has two players');

  return {
    room: {
      ...room,
      version: room.version + 1,
      seats: { ...room.seats, [color]: newToken },
    },
    color,
    token: newToken,
  };
}

/** If a running clock has hit zero, end the game on time. Returns the same object if nothing changed. */
export function settle(room: Room, now: number): Room {
  if (room.result) return room;
  const loser = flagged(room.clock, now);
  if (!loser) return room;
  return {
    ...room,
    version: room.version + 1,
    clock: stop(room.clock, now),
    result: { winner: other(loser), reason: 'timeout' },
  };
}

function requirePlayer(room: Room, token: string | null): Color {
  const color = seatOf(room, token);
  if (!color) throw new RoomError(403, 'You are not a player in this game');
  if (!room.seats.w || !room.seats.b) throw new RoomError(409, 'Waiting for an opponent to join');
  return color;
}

export function playMove(room: Room, token: string | null, move: ChessMove, now: number): Room {
  const current = settle(room, now);
  if (current.result) throw new RoomError(409, 'The game is over');
  const color = requirePlayer(current, token);
  if (turn(current.game) !== color) throw new RoomError(409, 'It is not your turn');

  const check = validateMove(current.game, move);
  if (!check.ok) throw new RoomError(422, check.reason ?? 'Illegal move');

  const game = applyMove(current.game, move);
  let clock = press(current.clock, color, now);
  const status = getStatus(game);

  let result: RoomResult | null = null;
  if (status.kind === 'checkmate') {
    result = { winner: status.winner, reason: 'checkmate' };
  } else if (status.kind === 'draw') {
    result = { winner: null, reason: status.reason };
  }
  if (result) clock = stop(clock, now);

  return { ...current, version: current.version + 1, game, clock, result };
}

export function resignRoom(room: Room, token: string | null, now: number): Room {
  const current = settle(room, now);
  if (current.result) throw new RoomError(409, 'The game is over');
  const color = requirePlayer(current, token);
  return {
    ...current,
    version: current.version + 1,
    clock: stop(current.clock, now),
    result: { winner: other(color), reason: 'resignation' },
  };
}

export function toView(room: Room, now: number): RoomView {
  return {
    id: room.id,
    version: room.version,
    serverNow: now,
    timeControlId: room.timeControlId,
    status: roomStatus(room),
    seats: { w: room.seats.w !== null, b: room.seats.b !== null },
    game: room.game,
    clock: room.clock,
    result: room.result,
  };
}

const DRAW_TEXT: Record<DrawReason, string> = {
  stalemate: 'Draw by stalemate',
  'insufficient-material': 'Draw: insufficient material',
  'threefold-repetition': 'Draw by threefold repetition',
  'fifty-move': 'Draw by the fifty-move rule',
};

export function describeResult(result: RoomResult): string {
  if (!result.winner) return DRAW_TEXT[result.reason as DrawReason] ?? 'Draw';
  const winner = COLOR_NAME[result.winner];
  const loser = COLOR_NAME[other(result.winner)];
  switch (result.reason) {
    case 'checkmate':
      return `${winner} wins by checkmate`;
    case 'resignation':
      return `${winner} wins: ${loser} resigned`;
    case 'timeout':
      return `${winner} wins on time`;
    default:
      return `${winner} wins`;
  }
}