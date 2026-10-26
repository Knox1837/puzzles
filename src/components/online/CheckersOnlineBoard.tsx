'use client';

import { useMemo, useState } from 'react';
import CheckersBoard from '../checkers/CheckersBoard';
import styles from '../chess/chess.module.css';
import type { OnlineBoardProps } from './types';
import {
  legalMoves,
  samePath,
  startsWithPath,
  type CheckersMove,
  type CheckersState,
  type Square,
} from '@/engines/checkers/engine';

export default function CheckersOnlineBoard({
  state,
  canMove,
  disabled,
  flipped,
  onMove,
}: OnlineBoardProps<CheckersState, CheckersMove>) {
  // The squares chosen so far for the current move (origin first).
  const [partial, setPartial] = useState<Square[]>([]);

  const moves = useMemo(() => legalMoves(state), [state]);
  const forcedCapture = moves.length > 0 && moves[0].captures.length > 0;

  const movable = useMemo(
    () => (forcedCapture && canMove ? new Set(moves.map((m) => m.path[0])) : new Set<Square>()),
    [moves, forcedCapture, canMove],
  );

  const targets = useMemo(() => {
    if (partial.length === 0) return new Set<Square>();
    return new Set(
      moves
        .filter((m) => m.path.length > partial.length && startsWithPath(m.path, partial))
        .map((m) => m.path[partial.length]),
    );
  }, [moves, partial]);

  const lastMove = useMemo(() => {
    const last = state.moves[state.moves.length - 1];
    return new Set<Square>(last ? [...last.path, ...last.captures] : []);
  }, [state.moves]);

  const onSquareClick = (sq: Square) => {
    if (!canMove) return;

    // Clicking the chosen piece again cancels the selection (nothing is committed until the end).
    if (partial.length > 0 && sq === partial[0]) {
      setPartial([]);
      return;
    }

    if (partial.length === 0) {
      if (moves.some((m) => m.path[0] === sq)) setPartial([sq]);
      return;
    }

    if (targets.has(sq)) {
      const next = [...partial, sq];
      if (moves.some((m) => samePath(m.path, next))) {
        setPartial([]);
        onMove({ path: next });
      } else {
        setPartial(next); // more jumps to make with this piece
      }
      return;
    }

    // Before the first landing square is chosen, another movable piece can be picked instead.
    if (partial.length === 1) {
      setPartial(moves.some((m) => m.path[0] === sq) ? [sq] : []);
    }
  };

  return (
    <div className={styles.boardWrap}>
      <CheckersBoard
        state={state}
        flipped={flipped}
        partial={partial}
        targets={targets}
        movable={movable}
        lastMove={lastMove}
        disabled={disabled}
        onSquareClick={onSquareClick}
      />
    </div>
  );
}
