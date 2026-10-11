import { CELLS, boxOf, colOf, rowOf } from './grid';

/** 81 bitmasks, one per cell. Bit (d - 1) set means digit d is pencilled in. */
export type Notes = number[];

export const emptyNotes = (): Notes => new Array<number>(CELLS).fill(0);

function bitFor(digit: number): number {
  if (!Number.isInteger(digit) || digit < 1 || digit > 9) {
    throw new RangeError(`Digit must be 1-9, got ${digit}`);
  }
  return 1 << (digit - 1);
}

export const hasNote = (mask: number, digit: number): boolean =>
  (mask & bitFor(digit)) !== 0;

/** Add the digit to the cell's notes, or remove it if already there. */
export function toggleNote(notes: Notes, index: number, digit: number): Notes {
  const next = notes.slice();
  next[index] ^= bitFor(digit);
  return next;
}

export function clearCellNotes(notes: Notes, index: number): Notes {
  const next = notes.slice();
  next[index] = 0;
  return next;
}

/**
 * After placing `digit` at `index`: clear that cell's notes and remove the
 * digit from the notes of every cell sharing its row, column or box.
 */
export function clearPeerNotes(notes: Notes, index: number, digit: number): Notes {
  const bit = bitFor(digit);
  const next = notes.slice();
  next[index] = 0;
  for (let j = 0; j < CELLS; j++) {
    if (j === index) continue;
    if (
      rowOf(j) === rowOf(index) ||
      colOf(j) === colOf(index) ||
      boxOf(j) === boxOf(index)
    ) {
      next[j] &= ~bit;
    }
  }
  return next;
}