'use client';

import { useEffect, useMemo } from 'react';
import ConnectFourBoard from '../connect4/ConnectFourBoard';
import styles from '../chess/chess.module.css';
import type { OnlineBoardProps } from './types';
import {
  getStatus,
  lastDiscIndex,
  type ConnectFourMove,
  type ConnectFourState,
} from '@/engines/connect4/engine';

export default function ConnectFourOnlineBoard({
  state,
  canMove,
  disabled,
  onMove,
}: OnlineBoardProps<ConnectFourState, ConnectFourMove>) {
  const status = useMemo(() => getStatus(state), [state]);
  const winLine = useMemo(() => new Set<number>(status.kind === 'win' ? status.line : []), [status]);
  const lastDisc = useMemo(() => lastDiscIndex(state), [state]);

  // Number keys 1-7 drop a disc on your turn (ignored while a form control has focus).
  useEffect(() => {
    if (!canMove) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ['SELECT', 'INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (/^[1-7]$/.test(e.key)) onMove({ column: Number(e.key) - 1 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canMove, onMove]);

  return (
    <div className={styles.boardWrap}>
      <ConnectFourBoard
        state={state}
        lastDisc={lastDisc}
        winLine={winLine}
        disabled={disabled || !canMove}
        onColumnClick={(column) => onMove({ column })}
      />
    </div>
  );
}
