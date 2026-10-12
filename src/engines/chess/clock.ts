import type { Color } from './engine';

/** `null` control means an untimed game. */
export interface TimeControl {
  /** Starting time per side, in milliseconds. */
  baseMs: number;
  /** Added to a side's clock after each of its moves, in milliseconds. */
  incrementMs: number;
}

export interface ClockState {
  control: TimeControl | null;
  whiteMs: number;
  blackMs: number;
  /** Whose clock is running; null before the first move or after stop(). */
  running: Color | null;
  /** Timestamp (ms) the running side's clock last started counting from. */
  lastTickAt: number | null;
}

export const TIME_CONTROLS: { id: string; label: string; control: TimeControl | null }[] = [
  { id: 'untimed', label: 'Untimed', control: null },
  { id: '1+0', label: '1 min', control: { baseMs: 60_000, incrementMs: 0 } },
  { id: '3+0', label: '3 min', control: { baseMs: 180_000, incrementMs: 0 } },
  { id: '3+2', label: '3 | 2', control: { baseMs: 180_000, incrementMs: 2_000 } },
  { id: '5+0', label: '5 min', control: { baseMs: 300_000, incrementMs: 0 } },
  { id: '10+0', label: '10 min', control: { baseMs: 600_000, incrementMs: 0 } },
  { id: '15+10', label: '15 | 10', control: { baseMs: 900_000, incrementMs: 10_000 } },
];

export function createClock(control: TimeControl | null): ClockState {
  const base = control?.baseMs ?? 0;
  return { control, whiteMs: base, blackMs: base, running: null, lastTickAt: null };
}

/** Time left for `color` at timestamp `now`. */
export function remaining(clock: ClockState, color: Color, now: number): number {
  const stored = color === 'w' ? clock.whiteMs : clock.blackMs;
  if (!clock.control) return stored;
  if (clock.running === color && clock.lastTickAt !== null) {
    return Math.max(0, stored - (now - clock.lastTickAt));
  }
  return stored;
}

/** The side whose time has run out at `now`, if any. */
export function flagged(clock: ClockState, now: number): Color | null {
  if (!clock.control || clock.running === null) return null;
  return remaining(clock, clock.running, now) <= 0 ? clock.running : null;
}

/**
 * Call when `mover` completes a move. Charges the elapsed time, adds the
 * increment, and starts the opponent's clock. The very first move of the
 * game (clock not yet running) is free: it just starts the opponent's clock.
 */
export function press(clock: ClockState, mover: Color, now: number): ClockState {
  if (!clock.control) return clock;
  const next: ClockState = { ...clock };

  if (clock.running === mover) {
    const left = Math.max(0, remaining(clock, mover, now) + clock.control.incrementMs);
    if (mover === 'w') next.whiteMs = left;
    else next.blackMs = left;
  }
  next.running = mover === 'w' ? 'b' : 'w';
  next.lastTickAt = now;
  return next;
}

/** Freeze both clocks (game over). Settles the running side's time. */
export function stop(clock: ClockState, now: number): ClockState {
  if (!clock.control || clock.running === null) return { ...clock, running: null, lastTickAt: null };
  const left = remaining(clock, clock.running, now);
  return {
    ...clock,
    whiteMs: clock.running === 'w' ? left : clock.whiteMs,
    blackMs: clock.running === 'b' ? left : clock.blackMs,
    running: null,
    lastTickAt: null,
  };
}

export function formatClock(ms: number): string {
  if (ms < 10_000) {
    const tenths = Math.floor(ms / 100) % 10;
    return `${Math.floor(ms / 1000)}.${tenths}`;
  }
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}