'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ConnectFourBoard from './ConnectFourBoard';
import styles from '../chess/chess.module.css'; // shared layout: panels, controls, banners
import c4 from './connect4.module.css';
import {
  applyMove,
  createGame,
  getStatus,
  lastDiscIndex,
  other,
  type ConnectFourState,
  type Disc,
} from '@/engines/connect4/engine';
import {
  TIME_CONTROLS,
  createClock,
  flagged,
  formatClock,
  press,
  remaining,
  stop,
  type ClockState,
} from '@/engines/chess/clock';

interface GameResult {
  winner: Disc | null;
  text: string;
}

const NAME: Record<Disc, string> = { r: 'Red', y: 'Yellow' };
// The shared clock code calls the first mover 'w' and the second 'b'.
const CLOCK_SIDE: Record<Disc, 'w' | 'b'> = { r: 'w', y: 'b' };
const FROM_CLOCK: Record<'w' | 'b', Disc> = { w: 'r', b: 'y' };

function controlFor(id: string) {
  return TIME_CONTROLS.find((t) => t.id === id)?.control ?? null;
}

export default function ConnectFourGame() {
  const [game, setGame] = useState<ConnectFourState>(createGame);
  const [tcId, setTcId] = useState('untimed');
  const [clock, setClock] = useState<ClockState>(() => createClock(null));
  const [now, setNow] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);

  const status = useMemo(() => getStatus(game), [game]);
  const lastDisc = useMemo(() => lastDiscIndex(game), [game]);
  const winLine = useMemo(
    () => new Set<number>(status.kind === 'win' ? status.line : []),
    [status],
  );

  // Clock ticking and flag detection.
  useEffect(() => {
    if (result || clock.running === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const loser = flagged(clock, t);
      if (loser) {
        const winner = other(FROM_CLOCK[loser]);
        setClock(stop(clock, t));
        setResult({ winner, text: `${NAME[winner]} wins on time` });
      }
    }, 100);
    return () => clearInterval(id);
  }, [clock, result]);

  const drop = useCallback(
    (column: number) => {
      if (result) return;
      const mover = game.turn;
      let next: ConnectFourState;
      try {
        next = applyMove(game, { column });
      } catch {
        return; // full column: ignore the click
      }
      const t = Date.now();
      const nextClock = press(clock, CLOCK_SIDE[mover], t);
      const nextStatus = getStatus(next);

      setGame(next);
      setNow(t);

      if (nextStatus.kind === 'playing') {
        setClock(nextClock);
      } else {
        setClock(stop(nextClock, t));
        setResult(
          nextStatus.kind === 'win'
            ? { winner: nextStatus.winner, text: `${NAME[nextStatus.winner]} wins with four in a row` }
            : { winner: null, text: 'Draw: the board is full' },
        );
      }
    },
    [game, clock, result],
  );

  // Number keys 1-7 drop a disc (ignored while a form control has focus).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ['SELECT', 'INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      if (/^[1-7]$/.test(e.key)) drop(Number(e.key) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drop]);

  const resign = (disc: Disc) => {
    if (result) return;
    setClock((c) => stop(c, Date.now()));
    setResult({ winner: other(disc), text: `${NAME[other(disc)]} wins: ${NAME[disc]} resigned` });
  };

  const newGame = () => {
    setGame(createGame());
    setClock(createClock(controlFor(tcId)));
    setNow(0);
    setResult(null);
  };

  const changeTimeControl = (id: string) => {
    setTcId(id);
    if (game.moves.length === 0 && !result) setClock(createClock(controlFor(id)));
  };

  const timed = clock.control !== null;

  const panel = (disc: Disc) => {
    const left = remaining(clock, CLOCK_SIDE[disc], now);
    const active = !result && game.turn === disc;
    return (
      <div className={`${styles.panel} ${active ? styles.panelActive : ''}`}>
        <span className={styles.name}>
          <span className={`${styles.dot} ${disc === 'r' ? c4.dotRed : c4.dotYellow}`} />
          {NAME[disc]}
        </span>
        <span className={styles.panelRight}>
          {timed && (
            <span
              className={`${styles.clock} ${left < 10_000 ? styles.clockLow : ''}`}
              aria-label={`${NAME[disc]} time`}
            >
              {formatClock(left)}
            </span>
          )}
          <button type="button" className={styles.smallBtn} disabled={!!result} onClick={() => resign(disc)}>
            Resign
          </button>
        </span>
      </div>
    );
  };

  const banner = result ? result.text : `${NAME[game.turn]} to move`;

  return (
    <div className={styles.game}>
      {panel('y')}

      <div className={styles.boardWrap}>
        <ConnectFourBoard
          state={game}
          lastDisc={lastDisc}
          winLine={winLine}
          disabled={!!result}
          onColumnClick={drop}
        />
      </div>

      {panel('r')}

      <p className={styles.result} role="status">
        {banner}
      </p>

      <div className={styles.controls}>
        <button type="button" className={styles.primary} onClick={newGame}>
          New game
        </button>
        <label className="visually-hidden" htmlFor="connect4-time-control">
          Time control
        </label>
        <select id="connect4-time-control" value={tcId} onChange={(e) => changeTimeControl(e.target.value)}>
          {TIME_CONTROLS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <p className={styles.hint}>
        Click a column, or press 1–7, to drop a disc. Red moves first.
        {timed ? ' Clocks start after the first move.' : ''}
      </p>
    </div>
  );
}