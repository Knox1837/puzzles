import type { PuzzleEngine, MoveResult } from '../core/types';
import { CELLS, findConflicts } from './grid';
import { generateSudoku } from './generator';

export interface SudokuState {
  /** 81 values, 0 = empty. */
  cells: number[];
  /** true where the cell is a locked clue. */
  givens: boolean[];
}

export interface SudokuMove {
  index: number;
  /** 1-9 to place, 0 to clear. */
  value: number;
}

export function createState(cells: readonly number[]): SudokuState {
  return { cells: cells.slice(), givens: cells.map((v) => v !== 0) };
}

/** Filled, non-given cells that differ from the solution (for mistake counts). */
export function countMistakes(state: SudokuState, solution: SudokuState): number {
  let mistakes = 0;
  for (let i = 0; i < CELLS; i++) {
    if (state.givens[i]) continue;
    const v = state.cells[i];
    if (v !== 0 && v !== solution.cells[i]) mistakes++;
  }
  return mistakes;
}

export const sudokuEngine: PuzzleEngine<SudokuState, SudokuMove> = {
  id: 'sudoku',

  generate(difficulty, seed) {
    const { puzzle, solution } = generateSudoku(difficulty, seed);
    return {
      puzzle: createState(puzzle),
      solution: { cells: solution, givens: new Array<boolean>(CELLS).fill(true) },
    };
  },

  validateMove(state, move): MoveResult {
    if (!Number.isInteger(move.index) || move.index < 0 || move.index >= CELLS) {
      return { ok: false, reason: 'Cell index out of range' };
    }
    if (!Number.isInteger(move.value) || move.value < 0 || move.value > 9) {
      return { ok: false, reason: 'Value must be an integer from 0 to 9' };
    }
    if (state.givens[move.index]) {
      return { ok: false, reason: 'Cannot change a given cell' };
    }
    return { ok: true };
  },

  applyMove(state, move) {
    const result = this.validateMove(state, move);
    if (!result.ok) throw new Error(result.reason);
    const cells = state.cells.slice();
    cells[move.index] = move.value;
    return { cells, givens: state.givens };
  },

  isComplete(state) {
    return state.cells.every((v) => v !== 0) && findConflicts(state.cells).size === 0;
  },

  progress(state, solution) {
    let total = 0;
    let correct = 0;
    for (let i = 0; i < CELLS; i++) {
      if (state.givens[i]) continue;
      total++;
      if (state.cells[i] === solution.cells[i]) correct++;
    }
    return total === 0 ? 1 : correct / total;
  },
};
