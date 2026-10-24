'use client';

import type { CSSProperties } from 'react';
import { COLS, ROWS, cellIndex, columnHeight, type ConnectFourState } from '@/engines/connect4/engine';
import styles from './connect4.module.css';

interface ConnectFourBoardProps {
  state: ConnectFourState;
  /** Index of the most recently dropped disc (it gets the falling animation). */
  lastDisc: number | null;
  /** Cells that make the winning four. */
  winLine: Set<number>;
  disabled?: boolean;
  onColumnClick: (column: number) => void;
}

export default function ConnectFourBoard({
  state,
  lastDisc,
  winLine,
  disabled,
  onColumnClick,
}: ConnectFourBoardProps) {
  const columns = Array.from({ length: COLS }, (_, c) => c);
  const rowsTopFirst = Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i);

  return (
    <div className={styles.board} role="group" aria-label="Connect Four board">
      {columns.map((col) => {
        const free = ROWS - columnHeight(state.board, col);
        return (
          <button
            key={col}
            type="button"
            className={styles.column}
            aria-label={`Column ${col + 1}, ${free} free`}
            disabled={disabled || free === 0}
            onClick={() => onColumnClick(col)}
          >
            {rowsTopFirst.map((row) => {
              const index = cellIndex(row, col);
              const disc = state.board[index];
              const classes = [styles.disc, disc === 'r' ? styles.red : styles.yellow];
              if (index === lastDisc) classes.push(styles.dropped, styles.last);
              if (winLine.has(index)) classes.push(styles.win);
              return (
                <span key={row} className={styles.cell} aria-hidden="true">
                  <span className={styles.hole}>
                    {disc !== '.' && (
                      <span
                        className={classes.join(' ')}
                        data-disc={disc}
                        data-win={winLine.has(index) ? 'true' : undefined}
                        style={{ '--fall': ROWS - row } as CSSProperties}
                      />
                    )}
                  </span>
                </span>
              );
            })}
          </button>
        );
      })}
    </div>
  );
}