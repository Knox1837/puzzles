import { sudokuEngine, countMistakes } from '../src/sudoku/engine';
import { prettyPrint } from '../src/sudoku/grid';
import type { Difficulty } from '../src/core/types';

const difficulties: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
const seed = process.argv[2] ?? 'demo-seed';

for (const d of difficulties) {
  const t0 = performance.now();
  const { puzzle, solution } = sudokuEngine.generate(d, seed);
  const ms = (performance.now() - t0).toFixed(1);
  const clues = puzzle.cells.filter(Boolean).length;
  console.log(`\n=== ${d} (seed "${seed}") - ${clues} clues, generated in ${ms}ms ===`);
  console.log(prettyPrint(puzzle.cells));
  if (d === 'easy') {
    console.log('\nSolution:');
    console.log(prettyPrint(solution.cells));
    console.log('Progress at start:', sudokuEngine.progress(puzzle, solution));
    console.log('Mistakes at start:', countMistakes(puzzle, solution));
  }
}
