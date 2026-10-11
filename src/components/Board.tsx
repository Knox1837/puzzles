'use client';

import { boxOf, colOf, rowOf } from '@/engines/sudoku/grid';
import type { SudokuState } from '@/engines/sudoku/engine';

interface BoardProps {
  state: SudokuState;
  selected: number | null;
  conflicts: Set<number>;
  /** Cells that differ from the solution (wrong even if no rule is broken). */
  wrong: Set<number>;
  disabled?: boolean;
  onSelect: (index: number) => void;
}

export default function Board({ state, selected, conflicts, wrong, disabled, onSelect }: BoardProps) {
  const selValue = selected !== null ? state.cells[selected] : 0;

  return (
    <div className="board" role="grid" aria-label="Sudoku board">
      {state.cells.map((value, i) => {
        const r = rowOf(i);
        const c = colOf(i);
        const isSelected = i === selected;
        const isPeer =
          selected !== null &&
          !isSelected &&
          (r === rowOf(selected) || c === colOf(selected) || boxOf(i) === boxOf(selected));
        const sameValue = selValue !== 0 && value === selValue && !isSelected;

        const classes = ['cell'];
        if (state.givens[i]) classes.push('given');
        else if (value !== 0) classes.push('entry');
        if (isPeer) classes.push('peer');
        if (sameValue) classes.push('same');
        if (isSelected) classes.push('selected');
        if (conflicts.has(i) || wrong.has(i)) classes.push('conflict');
        if (c % 3 === 2 && c !== 8) classes.push('box-right');
        if (r % 3 === 2 && r !== 8) classes.push('box-bottom');

        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            className={classes.join(' ')}
            aria-label={`Row ${r + 1}, column ${c + 1}, ${value === 0 ? 'empty' : value}`}
            aria-selected={isSelected}
            disabled={disabled}
            onClick={() => onSelect(i)}
          >
            {value !== 0 ? value : ''}
          </button>
        );
      })}
    </div>
  );
}