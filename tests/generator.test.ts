import { describe, it, expect } from 'vitest';
import { generateSudoku, CLUE_TARGETS } from '../src/sudoku/generator';
import { findConflicts } from '../src/sudoku/grid';
import { countSolutions } from '../src/sudoku/solver';
import type { Difficulty } from '../src/core/types';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
const clueCount = (cells: number[]) => cells.filter(Boolean).length;

describe('generator', () => {
  it('is deterministic for the same seed and difficulty', () => {
    const a = generateSudoku('medium', 'seed-1');
    const b = generateSudoku('medium', 'seed-1');
    expect(a).toEqual(b);
  });

  it('produces different puzzles for different seeds', () => {
    const a = generateSudoku('medium', 'seed-1');
    const b = generateSudoku('medium', 'seed-2');
    expect(a.puzzle).not.toEqual(b.puzzle);
  });

  for (const difficulty of DIFFICULTIES) {
    it(`generates a valid, unique puzzle (${difficulty})`, () => {
      for (const seed of ['a', 'b', 'c']) {
        const { puzzle, solution } = generateSudoku(difficulty, seed);

        // Solution is a complete, conflict-free grid.
        expect(solution.every((v) => v >= 1 && v <= 9)).toBe(true);
        expect(findConflicts(solution).size).toBe(0);

        // Every clue matches the solution.
        puzzle.forEach((v, i) => {
          if (v !== 0) expect(v).toBe(solution[i]);
        });

        // Exactly one solution.
        expect(countSolutions(puzzle, 2)).toBe(1);

        // Never fewer clues than the 17-clue theoretical minimum, and never
        // more than the target allows plus the cases where removal got stuck.
        expect(clueCount(puzzle)).toBeGreaterThanOrEqual(17);
        expect(clueCount(puzzle)).toBeLessThanOrEqual(CLUE_TARGETS[difficulty] + 6);
      }
    });
  }

  it('harder difficulties have fewer clues', () => {
    const avg = (d: Difficulty) => {
      const seeds = ['p', 'q', 'r', 's'];
      const total = seeds.reduce(
        (sum, s) => sum + clueCount(generateSudoku(d, s).puzzle),
        0,
      );
      return total / seeds.length;
    };
    expect(avg('easy')).toBeGreaterThan(avg('medium'));
    expect(avg('medium')).toBeGreaterThan(avg('hard'));
    expect(avg('hard')).toBeGreaterThanOrEqual(avg('expert'));
  });
});
