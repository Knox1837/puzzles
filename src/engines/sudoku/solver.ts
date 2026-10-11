import type { Rng } from '../core/rng';
import { shuffle } from '../core/rng';
import { CELLS, assertValidGrid, boxOf, colOf, rowOf } from './grid';

export interface SearchResult {
  /** Number of solutions found (capped at `limit`). */
  count: number;
  /** The first solution found, or null. */
  first: number[] | null;
}

function popcount(n: number): number {
  let c = 0;
  while (n) {
    n &= n - 1;
    c++;
  }
  return c;
}

/**
 * Backtracking search with bitmask candidates and the "minimum remaining
 * values" heuristic. Stops as soon as `limit` solutions are found.
 * Pass an rng to randomise digit order (used to generate full grids).
 */
export function search(
  grid: readonly number[],
  limit = 2,
  rng?: Rng,
): SearchResult {
  assertValidGrid(grid);
  const cells = grid.slice();
  const rows = new Array<number>(9).fill(0);
  const cols = new Array<number>(9).fill(0);
  const boxes = new Array<number>(9).fill(0);

  for (let i = 0; i < CELLS; i++) {
    const v = cells[i];
    if (!v) continue;
    const bit = 1 << (v - 1);
    const r = rowOf(i);
    const c = colOf(i);
    const b = boxOf(i);
    if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) {
      return { count: 0, first: null }; // given clues already conflict
    }
    rows[r] |= bit;
    cols[c] |= bit;
    boxes[b] |= bit;
  }

  let count = 0;
  let first: number[] | null = null;

  // Returns true when the search should stop (limit reached).
  const recurse = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;

    for (let i = 0; i < CELLS; i++) {
      if (cells[i] !== 0) continue;
      const mask = ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & 0x1ff;
      const n = popcount(mask);
      if (n === 0) return false; // dead end
      if (n < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = n;
        if (n === 1) break;
      }
    }

    if (best === -1) {
      count++;
      if (!first) first = cells.slice();
      return count >= limit;
    }

    const digits: number[] = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << (d - 1))) digits.push(d);
    if (rng) shuffle(digits, rng);

    const r = rowOf(best);
    const c = colOf(best);
    const b = boxOf(best);
    for (const d of digits) {
      const bit = 1 << (d - 1);
      cells[best] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      if (recurse()) return true;
      cells[best] = 0;
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
    }
    return false;
  };

  recurse();
  return { count, first };
}

/** First solution, or null if the puzzle is unsolvable. */
export function solve(grid: readonly number[]): number[] | null {
  return search(grid, 1).first;
}

/** Number of solutions, capped at `limit` (default 2). */
export function countSolutions(grid: readonly number[], limit = 2): number {
  return search(grid, limit).count;
}

export function hasUniqueSolution(grid: readonly number[]): boolean {
  return countSolutions(grid, 2) === 1;
}
