export const SIZE = 9;
export const CELLS = 81;

export const rowOf = (i: number) => Math.floor(i / SIZE);
export const colOf = (i: number) => i % SIZE;
export const boxOf = (i: number) =>
  Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** All 27 units (9 rows, 9 columns, 9 boxes) as arrays of cell indices. */
export const UNITS: number[][] = (() => {
  const units: number[][] = [];
  for (let n = 0; n < SIZE; n++) {
    const row: number[] = [];
    const col: number[] = [];
    const box: number[] = [];
    for (let k = 0; k < SIZE; k++) {
      row.push(n * SIZE + k);
      col.push(k * SIZE + n);
      const r = Math.floor(n / 3) * 3 + Math.floor(k / 3);
      const c = (n % 3) * 3 + (k % 3);
      box.push(r * SIZE + c);
    }
    units.push(row, col, box);
  }
  return units;
})();

export function assertValidGrid(cells: readonly number[]): void {
  if (cells.length !== CELLS) {
    throw new RangeError(`Grid must have ${CELLS} cells, got ${cells.length}`);
  }
  for (const v of cells) {
    if (!Number.isInteger(v) || v < 0 || v > 9) {
      throw new RangeError(`Invalid cell value: ${v}`);
    }
  }
}

/** Indices of every cell that shares a row/column/box with a duplicate. */
export function findConflicts(cells: readonly number[]): Set<number> {
  const conflicts = new Set<number>();
  for (const unit of UNITS) {
    const seen = new Map<number, number>();
    for (const idx of unit) {
      const v = cells[idx];
      if (!v) continue;
      const prev = seen.get(v);
      if (prev !== undefined) {
        conflicts.add(prev);
        conflicts.add(idx);
      } else {
        seen.set(v, idx);
      }
    }
  }
  return conflicts;
}

/** 81-char string, '0' for empty. Handy for DB storage and URLs. */
export function serialize(cells: readonly number[]): string {
  return cells.join('');
}

/** Accepts '0' or '.' for empty cells. */
export function parse(str: string): number[] {
  const clean = str.replace(/\s+/g, '');
  if (clean.length !== CELLS) {
    throw new RangeError(`Expected ${CELLS} characters, got ${clean.length}`);
  }
  return [...clean].map((ch) => {
    if (ch === '.' || ch === '0') return 0;
    const n = Number(ch);
    if (!Number.isInteger(n) || n < 1 || n > 9) {
      throw new RangeError(`Invalid character: ${ch}`);
    }
    return n;
  });
}

export function prettyPrint(cells: readonly number[]): string {
  const lines: string[] = [];
  for (let r = 0; r < SIZE; r++) {
    if (r > 0 && r % 3 === 0) lines.push('------+-------+------');
    const parts: string[] = [];
    for (let c = 0; c < SIZE; c++) {
      if (c > 0 && c % 3 === 0) parts.push('|');
      const v = cells[r * SIZE + c];
      parts.push(v ? String(v) : '.');
    }
    lines.push(parts.join(' '));
  }
  return lines.join('\n');
}
