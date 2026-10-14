'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ChessBoard, { pieceClass, pieceGlyph } from './ChessBoard';
import { loadSeat, saveSeat, type Seat } from './seat';
import styles from './chess.module.css';
import online from './online.module.css';
import {
  getBoard,
  getStatus,
  kingSquare,
  legalMoves,
  needsPromotion,
  turn,
  type ChessMove,
  type Color,
  type PromotionPiece,
  type Square,
} from '@/engines/chess/engine';
import { TIME_CONTROLS, flagged, formatClock, remaining } from '@/engines/chess/clock';
import { describeResult, type RoomView } from '@/engines/chess/room';

const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const PROMOTION_CHOICES: PromotionPiece[] = ['q', 'r', 'b', 'n'];
const PROMOTION_NAME = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' } as const;

export default function OnlineChessGame({ roomId }: { roomId: string }) {
  const [view, setView] = useState<RoomView | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // server time minus this browser's time
  const [, setTick] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [flippedOverride, setFlippedOverride] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const versionRef = useRef(0);
  const finishedRef = useRef(false);
  const lastSettleRef = useRef(0);
  const movesRef = useRef<HTMLDivElement>(null);

  // Read this browser's seat after mount (localStorage does not exist on the server).
  useEffect(() => {
    setSeat(loadSeat(roomId));
  }, [roomId]);

  const applyView = useCallback((v: RoomView, sentAt: number, receivedAt: number) => {
    setOffset(v.serverNow - (sentAt + receivedAt) / 2);
    if (v.version < versionRef.current) return; // an older reply that arrived late
    versionRef.current = v.version;
    finishedRef.current = v.status === 'finished';
    setView(v);
  }, []);

  const fetchRoom = useCallback(async () => {
    const sentAt = Date.now();
    try {
      const res = await fetch(`/api/chess/rooms/${roomId}?v=${versionRef.current}`, { cache: 'no-store' });
      const receivedAt = Date.now();
      if (res.status === 404) {
        setNotFound(true);
        finishedRef.current = true;
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed');
      if (data.unchanged) setOffset(data.serverNow - (sentAt + receivedAt) / 2);
      else applyView(data as RoomView, sentAt, receivedAt);
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg && msg !== 'Failed to fetch' ? msg : 'Connection problem, retrying…');
    }
  }, [roomId, applyView]);

  // Poll once a second (slower when the tab is hidden); stop once the game is over.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      await fetchRoom();
      if (stopped || finishedRef.current) return;
      timer = setTimeout(loop, document.hidden ? 5000 : 1000);
    };
    loop();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchRoom]);

  // Re-render often enough for smooth clocks.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, []);

  const estNow = Date.now() + offset; // best guess at the server's current time

  // If a clock looks like it hit zero, ask the server to settle it (throttled).
  const flagLoser = view && !view.result ? flagged(view.clock, estNow) : null;
  useEffect(() => {
    if (!flagLoser) return;
    const t = Date.now();
    if (t - lastSettleRef.current > 800) {
      lastSettleRef.current = t;
      fetchRoom();
    }
  });

  useEffect(() => {
    const el = movesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view?.game.moves.length]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const sentAt = Date.now();
      const res = await fetch(`/api/chess/rooms/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const receivedAt = Date.now();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Request failed');
      if (data.view) applyView(data.view as RoomView, sentAt, receivedAt);
      return data;
    },
    [roomId, applyView],
  );

  const joinGame = async () => {
    setBusy(true);
    try {
      const data = await post({ action: 'join', token: seat?.token });
      const next: Seat = { token: data.token, color: data.color };
      saveSeat(roomId, next);
      setSeat(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  };

  const submitMove = async (move: ChessMove) => {
    if (!seat) return;
    setBusy(true);
    setSelected(null);
    setPromo(null);
    try {
      await post({ action: 'move', token: seat.token, ...move });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Move rejected');
      fetchRoom(); // resync with the server's version of the game
    } finally {
      setBusy(false);
    }
  };

  const resign = async () => {
    if (!seat || !window.confirm('Resign this game?')) return;
    setBusy(true);
    try {
      await post({ action: 'resign', token: seat.token });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resign');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy automatically. Copy the link from the box instead.');
    }
  };

  const myColor = seat?.color ?? null;
  const board = useMemo(() => (view ? getBoard(view.game) : null), [view]);
  const toMove = view ? turn(view.game) : 'w';
  const playing = view?.status === 'playing';
  const myTurn = playing && myColor === toMove;

  const selectedMoves = useMemo(
    () => (view && selected ? legalMoves(view.game, selected) : []),
    [view, selected],
  );
  const targets = useMemo(() => new Set(selectedMoves.map((m) => m.to)), [selectedMoves]);
  const captures = useMemo(
    () => new Set(selectedMoves.filter((m) => m.captured).map((m) => m.to)),
    [selectedMoves],
  );

  const status = useMemo(() => (view ? getStatus(view.game) : null), [view]);
  const checkSquare = useMemo(() => {
    if (!view || !status) return null;
    if (status.kind === 'playing' && status.check) return kingSquare(view.game, toMove);
    if (status.kind === 'checkmate') return kingSquare(view.game, other(status.winner));
    return null;
  }, [view, status, toMove]);

  if (notFound) {
    return (
      <div className={online.lobby}>
        <h1 className={online.heading}>Game not found</h1>
        <p className={online.notice}>This game does not exist or has expired (games are kept for a day).</p>
        <Link href="/chess/online" className={online.link}>
          Start a new game
        </Link>
      </div>
    );
  }

  if (!view || !board) {
    return (
      <div className={online.lobby}>
        <p className={online.notice}>Loading game…</p>
        {error && (
          <p className={online.error} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  const lastMove = view.game.moves.length ? view.game.moves[view.game.moves.length - 1] : null;
  const flipped = flippedOverride ?? myColor === 'b';
  const timed = view.clock.control !== null;
  const freeSeat: Color | null = !view.seats.w ? 'w' : !view.seats.b ? 'b' : null;
  const canJoin = !myColor && freeSeat !== null && view.status === 'waiting';
  const spectating = !myColor && !canJoin;
  const timeLabel = TIME_CONTROLS.find((t) => t.id === view.timeControlId)?.label ?? view.timeControlId;

  const onSquareClick = (sq: Square) => {
    if (!myColor || !myTurn || busy || promo) return;

    if (selected && targets.has(sq)) {
      if (needsPromotion(view.game, selected, sq)) setPromo({ from: selected, to: sq });
      else submitMove({ from: selected, to: sq });
      return;
    }

    const file = sq.charCodeAt(0) - 97;
    const rank = 8 - Number(sq[1]);
    if (board[rank][file]?.color === myColor) setSelected(sq === selected ? null : sq);
    else setSelected(null);
  };

  const panel = (color: Color) => {
    const left = remaining(view.clock, color, estNow);
    const active = view.status === 'playing' && toMove === color;
    const joined = color === 'w' ? view.seats.w : view.seats.b;
    return (
      <div className={`${styles.panel} ${active ? styles.panelActive : ''}`}>
        <span className={styles.name}>
          <span className={`${styles.dot} ${color === 'w' ? styles.dotWhite : styles.dotBlack}`} />
          {COLOR_NAME[color]}
          {myColor === color && <span className={online.you}>(you)</span>}
          {!joined && <span className={online.you}>waiting…</span>}
        </span>
        {timed && (
          <span className={`${styles.clock} ${left < 10_000 ? styles.clockLow : ''}`} aria-label={`${COLOR_NAME[color]} time`}>
            {formatClock(left)}
          </span>
        )}
      </div>
    );
  };

  const rows: { no: number; w: string; b?: string }[] = [];
  view.game.moves.forEach((m, i) => {
    if (i % 2 === 0) rows.push({ no: i / 2 + 1, w: m.san });
    else rows[rows.length - 1].b = m.san;
  });

  let banner: string | null = null;
  if (view.result) {
    const text = describeResult(view.result);
    banner =
      myColor && view.result.winner
        ? `${view.result.winner === myColor ? 'You won' : 'You lost'}: ${text}`
        : text;
  } else if (view.status === 'playing') {
    const check = status?.kind === 'playing' && status.check ? ' (check)' : '';
    banner = myColor
      ? `${myTurn ? 'Your move' : "Opponent's move"}${check}`
      : `${COLOR_NAME[toMove]} to move${check}`;
  }

  const topColor: Color = flipped ? 'w' : 'b';
  const bottomColor: Color = flipped ? 'b' : 'w';

  return (
    <div className={styles.game}>
      {canJoin && (
        <div className={online.invite}>
          <p>You&apos;ve been invited to a game ({timeLabel}).</p>
          <span>You would play {COLOR_NAME[freeSeat!]}.</span>
          <button type="button" className={online.primary} onClick={joinGame} disabled={busy}>
            Join game
          </button>
        </div>
      )}

      {spectating && <p className={online.notice}>This game is full. You are watching.</p>}

      {myColor && view.status === 'waiting' && (
        <div className={online.invite}>
          <p>Send this link to your opponent</p>
          <input readOnly value={window.location.href} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
          <button type="button" className={online.primary} onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      )}

      {panel(topColor)}

      <div className={styles.boardWrap}>
        <ChessBoard
          state={view.game}
          flipped={flipped}
          selected={selected}
          targets={targets}
          captures={captures}
          lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
          checkSquare={checkSquare}
          disabled={view.status === 'finished'}
          onSquareClick={onSquareClick}
        />

        {promo && myColor && (
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
                    onClick={() => submitMove({ ...promo, promotion: p })}
                  >
                    <span className={pieceClass(myColor)}>{pieceGlyph(p)}</span>
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

      {banner && (
        <p className={styles.result} role="status">
          {banner}
        </p>
      )}
      {error && (
        <p className={online.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.controls}>
        <button type="button" onClick={() => setFlippedOverride(!flipped)}>
          Flip board
        </button>
        <button type="button" onClick={copyLink}>
          {copied ? 'Copied!' : 'Copy invite link'}
        </button>
        <button type="button" onClick={resign} disabled={!myColor || view.status !== 'playing' || busy}>
          Resign
        </button>
        <Link href="/chess/online" className={online.link}>
          New game
        </Link>
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
        Game code <strong>{view.id}</strong>
        {timed ? ' · clocks start after White’s first move' : ''}
      </p>
    </div>
  );
}