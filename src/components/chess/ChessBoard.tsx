'use client';

import type { BoardPiece, ChessState, PieceSymbol, Square } from '@/engines/chess/engine';
import { getBoard } from '@/engines/chess/engine';
import styles from './chess.module.css';

const GLYPHS: Record<PieceSymbol, string> = {
  k: '\u265A\uFE0E',
  q: '\u265B\uFE0E',
  r: '\u265C\uFE0E',
  b: '\u265D\uFE0E',
  n: '\u265E\uFE0E',
  p: '\u265F\uFE0E',
};

const NAMES: Record<PieceSymbol, string> = {
  k: 'king',
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
};

const FILES = 'abcdefgh';

export function pieceGlyph(type: PieceSymbol): string {
  return GLYPHS[type];
}

export function pieceClass(color: 'w' | 'b'): string {
  return color === 'w' ? styles.pieceWhite : styles.pieceBlack;
}

interface ChessBoardProps {
  state: ChessState;
  flipped: boolean;
  selected: Square | null;
  targets: Set<Square>;
  captures: Set<Square>;
  lastMove: { from: Square; to: Square } | null;
  checkSquare: Square | null;
  disabled?: boolean;
  onSquareClick: (square: Square) => void;
}

export default function ChessBoard({
  state,
  flipped,
  selected,
  targets,
  captures,
  lastMove,
  checkSquare,
  disabled,
  onSquareClick,
}: ChessBoardProps) {
  const board = getBoard(state);
  const order = [0, 1, 2, 3, 4, 5, 6, 7];
  const rows = flipped ? [...order].reverse() : order;
  const cols = flipped ? [...order].reverse() : order;

  return (
    <div className={styles.board} role="grid" aria-label="Chess board">
      {rows.map((r, displayRow) =>
        cols.map((f, displayCol) => {
          const piece: BoardPiece | null = board[r][f];
          const square = `${FILES[f]}${8 - r}` as Square;
          const isLight = (r + f) % 2 === 0;

          const classes = [styles.square, isLight ? styles.light : styles.dark];
          if (lastMove && (square === lastMove.from || square === lastMove.to)) classes.push(styles.lastMove);
          if (square === selected) classes.push(styles.selected);
          if (square === checkSquare) classes.push(styles.check);
          if (targets.has(square)) classes.push(styles.target);
          if (captures.has(square)) classes.push(styles.capture);

          const coordColor = isLight ? styles.onLight : styles.onDark;
          const label = piece
            ? `${square}, ${piece.color === 'w' ? 'white' : 'black'} ${NAMES[piece.type]}`
            : `${square}, empty`;

          return (
            <button
              key={square}
              type="button"
              role="gridcell"
              className={classes.join(' ')}
              aria-label={label}
              aria-selected={square === selected}
              disabled={disabled}
              onClick={() => onSquareClick(square)}
            >
              {displayCol === 0 && (
                <span className={`${styles.coord} ${styles.coordRank} ${coordColor}`} aria-hidden="true">
                  {8 - r}
                </span>
              )}
              {displayRow === 7 && (
                <span className={`${styles.coord} ${styles.coordFile} ${coordColor}`} aria-hidden="true">
                  {FILES[f]}
                </span>
              )}
              {piece && (
                <span className={`${styles.piece} ${pieceClass(piece.color)}`} aria-hidden="true">
                  {GLYPHS[piece.type]}
                </span>
              )}
            </button>
          );
        }),
      )}
    </div>
  );
}