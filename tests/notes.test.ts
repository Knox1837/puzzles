import { describe, it, expect } from 'vitest';
import {
  emptyNotes,
  hasNote,
  toggleNote,
  clearCellNotes,
  clearPeerNotes,
} from '../src/engines/sudoku/notes';

describe('notes', () => {
  it('starts empty with 81 cells', () => {
    const notes = emptyNotes();
    expect(notes).toHaveLength(81);
    expect(notes.every((m) => m === 0)).toBe(true);
  });

  it('toggles a digit on and off without mutating the input', () => {
    const start = emptyNotes();
    const on = toggleNote(start, 10, 5);
    expect(start[10]).toBe(0);
    expect(hasNote(on[10], 5)).toBe(true);
    expect(hasNote(on[10], 4)).toBe(false);
    const off = toggleNote(on, 10, 5);
    expect(off[10]).toBe(0);
  });

  it('supports several digits in one cell', () => {
    let notes = emptyNotes();
    for (const d of [1, 5, 9]) notes = toggleNote(notes, 0, d);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => hasNote(notes[0], d))).toEqual([1, 5, 9]);
  });

  it('rejects invalid digits', () => {
    expect(() => toggleNote(emptyNotes(), 0, 0)).toThrow(RangeError);
    expect(() => toggleNote(emptyNotes(), 0, 10)).toThrow(RangeError);
  });

  it('clearCellNotes empties just that cell', () => {
    let notes = toggleNote(emptyNotes(), 3, 2);
    notes = toggleNote(notes, 4, 2);
    notes = clearCellNotes(notes, 3);
    expect(notes[3]).toBe(0);
    expect(hasNote(notes[4], 2)).toBe(true);
  });

  it('clearPeerNotes removes the digit from row, column and box peers only', () => {
    // Place a 7 at cell 40 (row 4, col 4, centre box). Note a 7 everywhere.
    let notes = emptyNotes();
    for (let i = 0; i < 81; i++) notes = toggleNote(notes, i, 7);
    notes = toggleNote(notes, 40, 3); // extra note in the placed cell

    const next = clearPeerNotes(notes, 40, 7);

    expect(next[40]).toBe(0); // placed cell fully cleared
    expect(hasNote(next[36], 7)).toBe(false); // same row (4, 0)
    expect(hasNote(next[4], 7)).toBe(false); // same column (0, 4)
    expect(hasNote(next[30], 7)).toBe(false); // same box (3, 3)
    expect(hasNote(next[0], 7)).toBe(true); // unrelated cell keeps its note
    expect(hasNote(notes[36], 7)).toBe(true); // input not mutated
  });

  it('clearPeerNotes leaves other digits in peer cells alone', () => {
    let notes = toggleNote(emptyNotes(), 41, 7);
    notes = toggleNote(notes, 41, 2);
    const next = clearPeerNotes(notes, 40, 7);
    expect(hasNote(next[41], 7)).toBe(false);
    expect(hasNote(next[41], 2)).toBe(true);
  });
});