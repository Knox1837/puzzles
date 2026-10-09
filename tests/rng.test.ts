import { describe, it, expect } from 'vitest';
import { createRng, shuffle } from '../src/core/rng';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('abc');
    const b = createRng('abc');
    expect(Array.from({ length: 10 }, a)).toEqual(Array.from({ length: 10 }, b));
  });

  it('differs for different seeds', () => {
    const a = Array.from({ length: 5 }, createRng('abc'));
    const b = Array.from({ length: 5 }, createRng('abd'));
    expect(a).not.toEqual(b);
  });

  it('returns values in [0, 1)', () => {
    const rng = createRng('range');
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('shuffle keeps all elements', () => {
    const out = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], createRng('s'));
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
