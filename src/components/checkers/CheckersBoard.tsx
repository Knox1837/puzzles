'use client';

import { FILES, isDark, isKing, sideOf, type CheckersState, type Square } from '@/engines/checkers/engine';
import styles from './checkers.module.css';

interface CheckersBoardProps {
  state: CheckersState;
  flipped: boolean;
  /** The squares chosen so far in the current move (origin first). */
  partial: Square[];
  /** Squares the piece may land on next. */
  targets: Set<Square>;
  /** Pieces that are allowed to move (shown only when a capture is forced). */
  movable: Set<Square>;
  /** Squares touched by the previous move. */
  lastMove: Set<Square>;
  disabled?: boolean;
  onSquareClick: (square: Square) => void;
}

export default function CheckersBoard({
  state,
  flipped,
  partial,
  targets,
  movable,
  lastMove,
  disabled,
  onSquareClick,
}: CheckersBoardProps) {
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div className={styles.board} role="grid" aria-label="Checkers board">
      {ranks.map((rank, displayRow) =>
        files.map((file, displayCol) => {
          const idx = (rank - 1) * 8 + file;
          const square = `${FILES[file]}${rank}` as Square;
          const dark = isDark(idx);
          const ch = state.board[idx];
          const side = sideOf(ch);
          const coordColor = dark ? styles.onDark : styles.onLight;

          const classes = [styles.square, dark ? styles.dark : styles.light];
          if (lastMove.has(square)) classes.push(styles.lastMove);
          if (partial.includes(square)) classes.push(styles.selected);
          if (movable.has(square) && partial.length === 0) classes.push(styles.movable);
          if (targets.has(square)) classes.push(styles.target);

          const coords = (
            <>
              {displayCol === 0 && (
                <span className={`${styles.coord} ${styles.coordRank} ${coordColor}`} aria-hidden="true">
                  {rank}
                </span>
              )}
              {displayRow === 7 && (
                <span className={`${styles.coord} ${styles.coordFile} ${coordColor}`} aria-hidden="true">
                  {FILES[file]}
                </span>
              )}
            </>
          );

          const piece = side && (
            <span
              className={`${styles.piece} ${side === 'b' ? styles.pieceBlack : styles.pieceWhite}`}
              aria-hidden="true"
            >
              {isKing(ch) && <span className={styles.crown}>{'\u265B\uFE0E'}</span>}
            </span>
          );

          // Light squares are never used, so they are plain, non-interactive cells.
          if (!dark) {
            return (
              <div key={square} className={classes.join(' ')} aria-hidden="true">
                {coords}
              </div>
            );
          }

          const label = side
            ? `${square}, ${side === 'b' ? 'black' : 'white'} ${isKing(ch) ? 'king' : 'man'}`
            : `${square}, empty`;

          return (
            <button
              key={square}
              type="button"
              role="gridcell"
              className={classes.join(' ')}
              aria-label={label}
              aria-selected={partial[0] === square}
              disabled={disabled}
              onClick={() => onSquareClick(square)}
            >
              {coords}
              {piece}
            </button>
          );
        }),
      )}
    </div>
  );
}