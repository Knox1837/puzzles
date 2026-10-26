'use client';

import { useMemo, useState } from 'react';
import ChessBoard, { pieceClass, pieceGlyph } from '../chess/ChessBoard';
import styles from '../chess/chess.module.css';
import type { OnlineBoardProps } from './types';
import {
  getBoard,
  getStatus,
  kingSquare,
  legalMoves,
  needsPromotion,
  turn,
  type ChessMove,
  type ChessState,
  type Color,
  type PromotionPiece,
  type Square,
} from '@/engines/chess/engine';

const PROMOTION_CHOICES: PromotionPiece[] = ['q', 'r', 'b', 'n'];
const PROMOTION_NAME = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' } as const;
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export default function ChessOnlineBoard({
  state,
  mySide,
  canMove,
  disabled,
  flipped,
  onMove,
}: OnlineBoardProps<ChessState, ChessMove>) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);

  const board = useMemo(() => getBoard(state), [state]);
  const toMove = turn(state);
  const status = useMemo(() => getStatus(state), [state]);

  const selectedMoves = useMemo(() => (selected ? legalMoves(state, selected) : []), [state, selected]);
  const targets = useMemo(() => new Set(selectedMoves.map((m) => m.to)), [selectedMoves]);
  const captures = useMemo(
    () => new Set(selectedMoves.filter((m) => m.captured).map((m) => m.to)),
    [selectedMoves],
  );

  const checkSquare = useMemo(() => {
    if (status.kind === 'playing' && status.check) return kingSquare(state, toMove);
    if (status.kind === 'checkmate') return kingSquare(state, other(status.winner));
    return null;
  }, [status, state, toMove]);

  const last = state.moves.length ? state.moves[state.moves.length - 1] : null;

  const submit = (move: ChessMove) => {
    setSelected(null);
    setPromo(null);
    onMove(move);
  };

  const onSquareClick = (sq: Square) => {
    if (!mySide || !canMove || promo) return;

    if (selected && targets.has(sq)) {
      if (needsPromotion(state, selected, sq)) setPromo({ from: selected, to: sq });
      else submit({ from: selected, to: sq });
      return;
    }

    const file = sq.charCodeAt(0) - 97;
    const rank = 8 - Number(sq[1]);
    if (board[rank][file]?.color === mySide) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  return (
    <div className={styles.boardWrap}>
      <ChessBoard
        state={state}
        flipped={flipped}
        selected={selected}
        targets={targets}
        captures={captures}
        lastMove={last ? { from: last.from, to: last.to } : null}
        checkSquare={checkSquare}
        disabled={disabled}
        onSquareClick={onSquareClick}
      />

      {promo && mySide && (
        <div className={styles.overlay} role="dialog" aria-label="Choose promotion piece">
          <div className={styles.dialog}>
            <h2>Promote to</h2>
            <div className={styles.promoRow}>
              {PROMOTION_CHOICES.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={styles.promoBtn}
                  aria-label={PROMOTION_NAME[p]}
                  onClick={() => submit({ ...promo, promotion: p })}
                >
                  <span className={pieceClass(mySide as Color)}>{pieceGlyph(p)}</span>
                </button>
              ))}
            </div>
            <button type="button" className={styles.smallBtn} onClick={() => setPromo(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
