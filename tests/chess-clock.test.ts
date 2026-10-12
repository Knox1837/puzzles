import { describe, it, expect } from 'vitest';
import {
  createClock,
  press,
  remaining,
  flagged,
  stop,
  formatClock,
} from '../src/engines/chess/clock';

const FIVE_MIN = { baseMs: 300_000, incrementMs: 0 };
const BLITZ_INC = { baseMs: 180_000, incrementMs: 2_000 };

describe('chess clock', () => {
  it('does nothing for untimed games', () => {
    const clock = createClock(null);
    const next = press(clock, 'w', 1000);
    expect(next).toBe(clock);
    expect(flagged(clock, 10_000_000)).toBeNull();
  });

  it('starts both sides at the base time with no clock running', () => {
    const clock = createClock(FIVE_MIN);
    expect(clock.running).toBeNull();
    expect(remaining(clock, 'w', 5000)).toBe(300_000);
    expect(remaining(clock, 'b', 5000)).toBe(300_000);
  });

  it("makes white's first move free and starts black's clock", () => {
    const clock = press(createClock(BLITZ_INC), 'w', 1000);
    expect(clock.running).toBe('b');
    expect(clock.whiteMs).toBe(180_000); // no deduction, no increment
    expect(remaining(clock, 'b', 4000)).toBe(177_000);
  });

  it('charges elapsed time and adds the increment on later moves', () => {
    let clock = createClock(BLITZ_INC);
    clock = press(clock, 'w', 0); // black starts thinking at t=0
    clock = press(clock, 'b', 5000); // black used 5s, gets +2s
    expect(clock.blackMs).toBe(180_000 - 5000 + 2000);
    expect(clock.running).toBe('w');
    expect(remaining(clock, 'w', 8000)).toBe(180_000 - 3000);
  });

  it('flags the side that runs out of time', () => {
    let clock = createClock({ baseMs: 10_000, incrementMs: 0 });
    clock = press(clock, 'w', 0);
    expect(flagged(clock, 9_999)).toBeNull();
    expect(flagged(clock, 10_000)).toBe('b');
    expect(remaining(clock, 'b', 20_000)).toBe(0);
  });

  it('stop() settles the running side and freezes the clock', () => {
    let clock = createClock(FIVE_MIN);
    clock = press(clock, 'w', 0);
    clock = stop(clock, 12_000);
    expect(clock.running).toBeNull();
    expect(clock.blackMs).toBe(288_000);
    expect(remaining(clock, 'b', 999_999)).toBe(288_000);
  });

  it('formats times', () => {
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(9_400)).toBe('9.4');
    expect(formatClock(0)).toBe('0.0');
  });
});