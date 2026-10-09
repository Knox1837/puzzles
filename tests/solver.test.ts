import { describe, it, expect } from 'vitest';
import { parse, findConflicts, serialize } from '../src/sudoku/grid';
import { solve, countSolutions, hasUniqueSolution } from '../src/sudoku/solver';

const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

describe('solver', () => {
  it('solves a known puzzle', () => {
    const result = solve(parse(PUZZLE));
    expect(result).not.toBeNull();
    expect(serialize(result!)).toBe(SOLUTION);
  });

  it('reports exactly one solution for a well-formed puzzle', () => {
    expect(countSolutions(parse(PUZZLE))).toBe(1);
    expect(hasUniqueSolution(parse(PUZZLE))).toBe(true);
  });

  it('caps the solution count at the limit for under-constrained grids', () => {
    const empty = new Array(81).fill(0);
    expect(countSolutions(empty, 2)).toBe(2);
    expect(countSolutions(empty, 5)).toBe(5);
  });

  it('returns 0 solutions when the givens conflict', () => {
    const bad = parse(PUZZLE);
    bad[1] = 5; // duplicates the 5 at index 0 in the same row
    expect(countSolutions(bad)).toBe(0);
    expect(solve(bad)).toBeNull();
  });

  it('returns 0 solutions for a grid with no legal completion', () => {
    // Row 0 holds 1-8; column 8 holds a 9 below, so cell 8 has no candidates.
    const cells = new Array(81).fill(0);
    for (let c = 0; c < 8; c++) cells[c] = c + 1;
    cells[17] = 9;
    expect(countSolutions(cells)).toBe(0);
  });

  it('rejects malformed input', () => {
    expect(() => solve([1, 2, 3])).toThrow(RangeError);
    expect(() => solve(new Array(81).fill(10))).toThrow(RangeError);
  });

  it('findConflicts flags duplicates and nothing else', () => {
    expect(findConflicts(parse(SOLUTION)).size).toBe(0);
    const bad = parse(SOLUTION);
    bad[1] = bad[0];
    const conflicts = findConflicts(bad);
    expect(conflicts.has(0)).toBe(true);
    expect(conflicts.has(1)).toBe(true);
  });
});
