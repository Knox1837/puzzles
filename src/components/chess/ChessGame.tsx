'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChessBoard, { pieceClass, pieceGlyph } from './ChessBoard';
import styles from './chess.module.css';
import {
  applyMove,
  createGame,
  getBoard,
  getStatus,
  kingSquare,
  legalMoves,
  needsPromotion,
  turn,
  type ChessMove,
  type ChessState,
  type Color,
  type DrawReason,
  type PromotionPiece,
  type Square,
} from '@/engines/chess/engine';
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
  winner: Color | null;
  text: string;
}

const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

const DRAW_TEXT: Record<DrawReason, string> = {
  stalemate: 'Draw by stalemate',
  'insufficient-material': 'Draw: insufficient material',
  'threefold-repetition': 'Draw by threefold repetition',
  'fifty-move': 'Draw by the fifty-move rule',
};

const PROMOTION_CHOICES: PromotionPiece[] = ['q', 'r', 'b', 'n'];

function controlFor(id: string) {
  return TIME_CONTROLS.find((t) => t.id === id)?.control ?? null;
}

export default function ChessGame() {
  const [game, setGame] = useState<ChessState>(createGame);
  const [tcId, setTcId] = useState('untimed');
  const [clock, setClock] = useState<ClockState>(() => createClock(null));
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [result, setResult] = useState<GameResult | null>(null);
  const movesRef = useRef<HTMLDivElement>(null);

  const status = useMemo(() => getStatus(game), [game]);
  const toMove = turn(game);
  const board = useMemo(() => getBoard(game), [game]);

  const pieceColorAt = useCallback(
    (sq: Square): Color | null => {
      const file = sq.charCodeAt(0) - 97;
      const rank = 8 - Number(sq[1]);
      return board[rank][file]?.color ?? null;
    },
    [board],
  );

  const selectedMoves = useMemo(
    () => (selected ? legalMoves(game, selected) : []),
    [game, selected],
  );
  const targets = useMemo(() => new Set(selectedMoves.map((m) => m.to)), [selectedMoves]);
  const captures = useMemo(
    () => new Set(selectedMoves.filter((m) => m.captured).map((m) => m.to)),
    [selectedMoves],
  );

  const lastMove = game.moves.length ? game.moves[game.moves.length - 1] : null;

  const checkSquare = useMemo(() => {
    if (status.kind === 'playing' && status.check) return kingSquare(game, toMove);
    if (status.kind === 'checkmate') return kingSquare(game, other(status.winner));
    return null;
  }, [status, game, toMove]);

  // Clock ticking + flag detection.
  useEffect(() => {
    if (result || clock.running === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const loser = flagged(clock, t);
      if (loser) {
        setClock(stop(clock, t));
        setResult({ winner: other(loser), text: `${COLOR_NAME[other(loser)]} wins on time` });
        setSelected(null);
      }
    }, 100);
    return () => clearInterval(id);
  }, [clock, result]);

  // Keep the newest move in view.
  useEffect(() => {
    const el = movesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [game.moves.length]);

  const makeMove = useCallback(
    (move: ChessMove) => {
      if (result) return;
      const mover = turn(game);
      const next = applyMove(game, move);
      const t = Date.now();
      const nextClock = press(clock, mover, t);
      const nextStatus = getStatus(next);

      setGame(next);
      setNow(t);
      setSelected(null);
      setPromo(null);

      if (nextStatus.kind === 'playing') {
        setClock(nextClock);
      } else {
        setClock(stop(nextClock, t));
        setResult(
          nextStatus.kind === 'checkmate'
            ? { winner: nextStatus.winner, text: `${COLOR_NAME[nextStatus.winner]} wins by checkmate` }
            : { winner: null, text: DRAW_TEXT[nextStatus.reason] },
        );
      }
    },
    [game, clock, result],
  );

  const onSquareClick = (sq: Square) => {
    if (result || promo) return;

    if (selected && targets.has(sq)) {
      if (needsPromotion(game, selected, sq)) {
        setPromo({ from: selected, to: sq });
      } else {
        makeMove({ from: selected, to: sq });
      }
      return;
    }

    if (pieceColorAt(sq) === toMove) {
      setSelected(sq === selected ? null : sq);
    } else {
      setSelected(null);
    }
  };

  const resign = (color: Color) => {
    if (result) return;
    setClock((c) => stop(c, Date.now()));
    setResult({
      winner: other(color),
      text: `${COLOR_NAME[other(color)]} wins: ${COLOR_NAME[color]} resigned`,
    });
    setSelected(null);
    setPromo(null);
  };

  const newGame = () => {
    setGame(createGame());
    setClock(createClock(controlFor(tcId)));
    setNow(0);
    setSelected(null);
    setPromo(null);
    setResult(null);
  };

  const changeTimeControl = (id: string) => {
    setTcId(id);
    // Before the first move, apply the new control straight away.
    if (game.moves.length === 0 && !result) setClock(createClock(controlFor(id)));
  };

  const timed = clock.control !== null;

  const panel = (color: Color) => {
    const left = remaining(clock, color, now);
    const active = !result && toMove === color;
    return (
      <div className={`${styles.panel} ${active ? styles.panelActive : ''}`}>
        <span className={styles.name}>
          <span className={`${styles.dot} ${color === 'w' ? styles.dotWhite : styles.dotBlack}`} />
          {COLOR_NAME[color]}
        </span>
        <span className={styles.panelRight}>
          {timed && (
            <span
              className={`${styles.clock} ${left < 10_000 ? styles.clockLow : ''}`}
              aria-label={`${COLOR_NAME[color]} time`}
            >
              {formatClock(left)}
            </span>
          )}
          <button
            type="button"
            className={styles.smallBtn}
            disabled={!!result}
            onClick={() => resign(color)}
          >
            Resign
          </button>
        </span>
      </div>
    );
  };

  // Pair moves into numbered rows: [white, black?].
  const rows: { no: number; w: string; b?: string }[] = [];
  game.moves.forEach((m, i) => {
    if (i % 2 === 0) rows.push({ no: i / 2 + 1, w: m.san });
    else rows[rows.length - 1].b = m.san;
  });

  const topColor: Color = flipped ? 'w' : 'b';
  const bottomColor: Color = flipped ? 'b' : 'w';

  return (
    <div className={styles.game}>
      {panel(topColor)}

      <div className={styles.boardWrap}>
        <ChessBoard
          state={game}
          flipped={flipped}
          selected={selected}
          targets={targets}
          captures={captures}
          lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
          checkSquare={checkSquare}
          disabled={!!result}
          onSquareClick={onSquareClick}
        />

        {promo && (
          <div className={styles.overlay} role="dialog" aria-label="Choose promotion piece">
            <div className={styles.dialog}>
              <h2>Promote to</h2>
              <div className={styles.promoRow}>
                {PROMOTION_CHOICES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={styles.promoBtn}
                    aria-label={{ q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p]}
                    onClick={() => makeMove({ ...promo, promotion: p })}
                  >
                    <span className={pieceClass(toMove)}>{pieceGlyph(p)}</span>
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

      {panel(bottomColor)}

      {result ? (
        <p className={styles.result} role="status">
          {result.text}
        </p>
      ) : (
        status.kind === 'playing' &&
        status.check && (
          <p className={styles.result} role="status">
            {COLOR_NAME[toMove]} is in check
          </p>
        )
      )}

      <div className={styles.controls}>
        <button type="button" className={styles.primary} onClick={newGame}>
          New game
        </button>
        <label className="visually-hidden" htmlFor="time-control">
          Time control
        </label>
        <select id="time-control" value={tcId} onChange={(e) => changeTimeControl(e.target.value)}>
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
          <span className={styles.movesEmpty}>No moves yet. White to start.</span>
        ) : (
          rows.map((r) => (
            <div key={r.no} className={styles.moveRow}>
              <span className={styles.moveNo}>{r.no}.</span>
              <span>{r.w}</span>
              <span>{r.b ?? ''}</span>
            </div>
          ))
        )}
      </div>

      <p className={styles.hint}>
        Click a piece, then a highlighted square. {timed ? 'Clocks start after White’s first move.' : ''}
      </p>
    </div>
  );
}