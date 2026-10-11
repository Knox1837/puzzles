import { sudokuEngine } from './sudoku/engine';
import type { PuzzleEngine } from './core/types';

export * from './core/types';
export * from './core/rng';
export * as sudoku from './sudoku';
export { sudokuEngine };

/** Registry: add new puzzle engines here. */
export const engines: Record<string, PuzzleEngine<any, any>> = {
  [sudokuEngine.id]: sudokuEngine,
};
