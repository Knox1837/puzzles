'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CheckersBoard from './CheckersBoard';
import styles from '../chess/chess.module.css'; // shared layout: panels, controls, move list
import {
  applyMove,
  countPieces,
  createGame,
  getStatus,
  legalMoves,
  samePath,
  startsWithPath,
  type CheckersState,
  type DrawReason,
  type Side,
  type Square,
} from '@/engines/checkers/engine';
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
  winner: Side | null;
  text: string;
}

const SIDE_NAME: Record<Side, string> = { b: 'Black', w: 'White' };
const other = (s: Side): Side => (s === 'b' ? 'w' : 'b');

const DRAW_TEXT: Record<DrawReason, string> = {
  repetition: 'Draw by repetition',
  'forty-move': 'Draw: 40 moves each without a capture or a man moving',
};

function controlFor(id: string) {
  return TIME_CONTROLS.find((t) => t.id === id)?.control ?? null;
}

export default function CheckersGame() {
  const [game, setGame] = useState<CheckersState>(createGame);
  const [tcId, setTcId] = useState('untimed');
  const [clock, setClock] = useState<ClockState>(() => createClock(null));
  const [now, setNow] = useState(0);
  const [partial, setPartial] = useState<Square[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const movesRef = useRef<HTMLDivElement>(null);

  const status = useMemo(() => getStatus(game), [game]);
  const moves = useMemo(() => legalMoves(game), [game]);
  const forcedCapture = moves.length > 0 && moves[0].captures.length > 0;

  // Pieces that may move, highlighted only when a capture is forced.
  const movable = useMemo(
    () => (forcedCapture ? new Set(moves.map((m) => m.path[0])) : new Set<Square>()),
    [moves, forcedCapture],
  );

  const targets = useMemo(() => {
    if (partial.length === 0) return new Set<Square>();
    const next = moves
      .filter((m) => m.path.length > partial.length && startsWithPath(m.path, partial))
      .map((m) => m.path[partial.length]);
    return new Set(next);
  }, [moves, partial]);

  const lastMove = useMemo(() => {
    const last = game.moves[game.moves.length - 1];
    return new Set<Square>(last ? [...last.path, ...last.captures] : []);
  }, [game.moves]);

  const counts = useMemo(() => countPieces(game.board), [game.board]);

  // Clock ticking and flag detection.
  useEffect(() => {
    if (result || clock.running === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const loser = flagged(clock, t);
      if (loser) {
        setClock(stop(clock, t));
        setResult({ winner: other(loser), text: `${SIDE_NAME[other(loser)]} wins on time` });
        setPartial([]);
      }
    }, 100);
    return () => clearInterval(id);
  }, [clock, result]);

  useEffect(() => {
    const el = movesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [game.moves.length]);

  const makeMove = useCallback(
    (path: Square[]) => {
      if (result) return;
      const mover = game.turn;
      const next = applyMove(game, { path });
      const t = Date.now();
      const nextClock = press(clock, mover, t);
      const nextStatus = getStatus(next);

      setGame(next);
      setNow(t);
      setPartial([]);

      if (nextStatus.kind === 'playing') {
        setClock(nextClock);
      } else {
        setClock(stop(nextClock, t));
        setResult(
          nextStatus.kind === 'win'
            ? {
                winner: nextStatus.winner,
                text: `${SIDE_NAME[nextStatus.winner]} wins: ${SIDE_NAME[other(nextStatus.winner)]} ${
                  nextStatus.reason === 'no-pieces' ? 'has no pieces left' : 'cannot move'
                }`,
              }
            : { winner: null, text: DRAW_TEXT[nextStatus.reason] },
        );
      }
    },
    [game, clock, result],
  );

  const onSquareClick = (sq: Square) => {
    if (result) return;

    // Clicking the chosen piece again cancels the selection (before the move is committed).
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
      if (moves.some((m) => samePath(m.path, next))) makeMove(next);
      else setPartial(next); // more jumps to make with this piece
      return;
    }

    // Before the first landing square is chosen, another movable piece can be picked instead.
    if (partial.length === 1) {
      setPartial(moves.some((m) => m.path[0] === sq) ? [sq] : []);
    }
  };

  const resign = (side: Side) => {
    if (result) return;
    setClock((c) => stop(c, Date.now()));
    setResult({
      winner: other(side),
      text: `${SIDE_NAME[other(side)]} wins: ${SIDE_NAME[side]} resigned`,
    });
    setPartial([]);
  };

  const newGame = () => {
    setGame(createGame());
    setClock(createClock(controlFor(tcId)));
    setNow(0);
    setPartial([]);
    setResult(null);
  };

  const changeTimeControl = (id: string) => {
    setTcId(id);
    if (game.moves.length === 0 && !result) setClock(createClock(controlFor(id)));
  };

  const timed = clock.control !== null;

  const panel = (side: Side) => {
    const left = remaining(clock, side, now);
    const active = !result && game.turn === side;
    return (
      <div className={`${styles.panel} ${active ? styles.panelActive : ''}`}>
        <span className={styles.name}>
          <span className={`${styles.dot} ${side === 'w' ? styles.dotWhite : styles.dotBlack}`} />
          {SIDE_NAME[side]}
          <span className={styles.moveNo}>{counts[side]} pieces</span>
        </span>
        <span className={styles.panelRight}>
          {timed && (
            <span
              className={`${styles.clock} ${left < 10_000 ? styles.clockLow : ''}`}
              aria-label={`${SIDE_NAME[side]} time`}
            >
              {formatClock(left)}
            </span>
          )}
          <button type="button" className={styles.smallBtn} disabled={!!result} onClick={() => resign(side)}>
            Resign
          </button>
        </span>
      </div>
    );
  };

  // Black moves first, so each numbered row reads: black move, white reply.
  const rows: { no: number; b: string; w?: string }[] = [];
  game.moves.forEach((m, i) => {
    if (i % 2 === 0) rows.push({ no: i / 2 + 1, b: m.notation });
    else rows[rows.length - 1].w = m.notation;
  });

  let banner: string | null = null;
  if (result) banner = result.text;
  else if (status.kind === 'playing') {
    banner = `${SIDE_NAME[game.turn]} to move`;
    if (partial.length > 1) banner += ': keep jumping';
    else if (forcedCapture) banner += ': a capture is mandatory';
  }

  const topSide: Side = flipped ? 'b' : 'w';
  const bottomSide: Side = flipped ? 'w' : 'b';

  return (
    <div className={styles.game}>
      {panel(topSide)}

      <div className={styles.boardWrap}>
        <CheckersBoard
          state={game}
          flipped={flipped}
          partial={partial}
          targets={targets}
          movable={movable}
          lastMove={lastMove}
          disabled={!!result}
          onSquareClick={onSquareClick}
        />
      </div>

      {panel(bottomSide)}

      {banner && (
        <p className={styles.result} role="status">
          {banner}
        </p>
      )}

      <div className={styles.controls}>
        <button type="button" className={styles.primary} onClick={newGame}>
          New game
        </button>
        <label className="visually-hidden" htmlFor="checkers-time-control">
          Time control
        </label>
        <select id="checkers-time-control" value={tcId} onChange={(e) => changeTimeControl(e.target.value)}>
          {TIME_CONTROLS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setFlipped((f) => !f)}>
          Flip board
        </button>
      </div>

      <div className={styles.moves} ref={movesRef} aria-label="Move list">
        {rows.length === 0 ? (
          <span className={styles.movesEmpty}>No moves yet. Black to start.</span>
        ) : (
          rows.map((r) => (
            <div key={r.no} className={styles.moveRow}>
              <span className={styles.moveNo}>{r.no}.</span>
              <span>{r.b}</span>
              <span>{r.w ?? ''}</span>
            </div>
          ))
        )}
      </div>

      <p className={styles.hint}>
        Click a piece, then a highlighted square. Captures are mandatory and multi-jumps continue square by square.
        {timed ? ' Clocks start after the first move.' : ''}
      </p>
    </div>
  );
}