import type { Difficulty, GeneratedPuzzle } from '../core/types';
import { createRng, shuffle } from '../core/rng';
import { CELLS } from './grid';
import { countSolutions, search } from './solver';

/**
 * Target number of clues per difficulty. This is a simple clue-count grade;
 * a technique-based grader (naked/hidden singles, pairs, X-wing...) can
 * replace it later without changing the engine interface.
 */
export const CLUE_TARGETS: Record<Difficulty, number> = {
  easy: 40,
  medium: 34,
  hard: 29,
  expert: 25,
};

export function generateSudoku(
  difficulty: Difficulty,
  seed: string,
): GeneratedPuzzle<number[]> {
  const rng = createRng(seed);

  // 1. Build a complete valid grid using randomised backtracking.
  const solution = search(new Array<number>(CELLS).fill(0), 1, rng).first!;

  // 2. Remove cells in random order, keeping the solution unique.
  const puzzle = solution.slice();
  const order = shuffle(
    Array.from({ length: CELLS }, (_, i) => i),
    rng,
  );
  const target = CLUE_TARGETS[difficulty];
  let clues = CELLS;

  for (const idx of order) {
    if (clues <= target) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    if (countSolutions(puzzle, 2) === 1) {
      clues--;
    } else {
      puzzle[idx] = backup;
    }
  }

  return { puzzle, solution };
}
