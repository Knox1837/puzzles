import { describe, it, expect } from 'vitest';
import {
  sudokuEngine,
  createState,
  countMistakes,
  type SudokuState,
} from '../src/sudoku/engine';
import { parse } from '../src/sudoku/grid';
import { engines } from '../src/index';

const PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

function fixture() {
  const puzzle = createState(parse(PUZZLE));
  const solution: SudokuState = {
    cells: parse(SOLUTION),
    givens: new Array(81).fill(true),
  };
  return { puzzle, solution };
}

describe('sudokuEngine', () => {
  it('is registered under its id', () => {
    expect(engines.sudoku).toBe(sudokuEngine);
  });

  it('generate() returns a puzzle whose givens match its clues', () => {
    const { puzzle, solution } = sudokuEngine.generate('easy', 'engine-seed');
    puzzle.cells.forEach((v, i) => {
      expect(puzzle.givens[i]).toBe(v !== 0);
      if (v !== 0) expect(v).toBe(solution.cells[i]);
    });
    expect(sudokuEngine.progress(puzzle, solution)).toBe(0);
    expect(sudokuEngine.isComplete(puzzle)).toBe(false);
  });

  describe('validateMove', () => {
    const { puzzle } = fixture();

    it('accepts a move on an empty cell', () => {
      expect(sudokuEngine.validateMove(puzzle, { index: 2, value: 4 }).ok).toBe(true);
    });

    it('accepts clearing a cell (value 0)', () => {
      expect(sudokuEngine.validateMove(puzzle, { index: 2, value: 0 }).ok).toBe(true);
    });

    it('rejects changes to given cells', () => {
      const r = sudokuEngine.validateMove(puzzle, { index: 0, value: 1 });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/given/i);
    });

    it('rejects out-of-range index and value', () => {
      expect(sudokuEngine.validateMove(puzzle, { index: -1, value: 1 }).ok).toBe(false);
      expect(sudokuEngine.validateMove(puzzle, { index: 81, value: 1 }).ok).toBe(false);
      expect(sudokuEngine.validateMove(puzzle, { index: 2, value: 10 }).ok).toBe(false);
      expect(sudokuEngine.validateMove(puzzle, { index: 2, value: 1.5 }).ok).toBe(false);
    });
  });

  describe('applyMove', () => {
    it('is pure and does not mutate the input state', () => {
      const { puzzle } = fixture();
      const before = [...puzzle.cells];
      const next = sudokuEngine.applyMove(puzzle, { index: 2, value: 4 });
      expect(puzzle.cells).toEqual(before);
      expect(next.cells[2]).toBe(4);
      expect(next).not.toBe(puzzle);
    });

    it('throws on an invalid move', () => {
      const { puzzle } = fixture();
      expect(() => sudokuEngine.applyMove(puzzle, { index: 0, value: 9 })).toThrow();
    });
  });

  describe('completion, progress and mistakes', () => {
    it('plays a full game to completion', () => {
      const { puzzle, solution } = fixture();
      let state = puzzle;
      let moves = 0;
      for (let i = 0; i < 81; i++) {
        if (state.givens[i]) continue;
        expect(sudokuEngine.isComplete(state)).toBe(false);
        state = sudokuEngine.applyMove(state, { index: i, value: solution.cells[i] });
        moves++;
      }
      expect(moves).toBe(81 - 30);
      expect(sudokuEngine.isComplete(state)).toBe(true);
      expect(sudokuEngine.progress(state, solution)).toBe(1);
      expect(countMistakes(state, solution)).toBe(0);
    });

    it('does not treat a full grid with conflicts as complete', () => {
      const { puzzle, solution } = fixture();
      let state = puzzle;
      for (let i = 0; i < 81; i++) {
        if (!state.givens[i]) {
          state = sudokuEngine.applyMove(state, { index: i, value: solution.cells[i] });
        }
      }
      const broken = sudokuEngine.applyMove(state, {
        index: 2,
        value: solution.cells[3], // duplicate within the row
      });
      expect(sudokuEngine.isComplete(broken)).toBe(false);
    });

    it('tracks progress and mistakes separately', () => {
      const { puzzle, solution } = fixture();
      const empties = puzzle.cells
        .map((v, i) => (v === 0 ? i : -1))
        .filter((i) => i >= 0);

      let state = puzzle;
      state = sudokuEngine.applyMove(state, {
        index: empties[0],
        value: solution.cells[empties[0]],
      });
      const wrong = (solution.cells[empties[1]] % 9) + 1;
      state = sudokuEngine.applyMove(state, { index: empties[1], value: wrong });

      expect(sudokuEngine.progress(state, solution)).toBeCloseTo(1 / empties.length);
      expect(countMistakes(state, solution)).toBe(1);

      // Clearing the wrong cell removes the mistake.
      state = sudokuEngine.applyMove(state, { index: empties[1], value: 0 });
      expect(countMistakes(state, solution)).toBe(0);
    });
  });
});
