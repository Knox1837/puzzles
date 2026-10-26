'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BOARDS } from './boards';
import { loadSeat, saveSeat, type Seat } from './seat';
import styles from '../chess/chess.module.css'; // shared layout: panels, controls, move list
import online from '../chess/online.module.css';
import { findGame } from '@/engines/online/games';
import { clockSlot, describeResult, type OnlineGameDef, type RoomView } from '@/engines/online/room';
import { TIME_CONTROLS, flagged, formatClock, remaining } from '@/engines/chess/clock';

/** Colour of the little dot beside each side's name. */
const DOT_COLOR: Record<string, string> = { w: '#ffffff', b: '#1a1a1a', r: '#d93a3a', y: '#f2c230' };

export default function OnlineGame({ game, roomId }: { game: string; roomId: string }) {
  const def = findGame(game);
  if (!def) {
    return (
      <div className={online.lobby}>
        <h1 className={online.heading}>Unknown game</h1>
        <Link href="/" className={online.link}>
          Back to all games
        </Link>
      </div>
    );
  }
  return <OnlineGameRoom def={def} roomId={roomId} />;
}

function OnlineGameRoom({ def, roomId }: { def: OnlineGameDef; roomId: string }) {
  const Board = BOARDS[def.id];

  const [view, setView] = useState<RoomView | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // server time minus this browser's time
  const [, setTick] = useState(0);
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
      const res = await fetch(`/api/rooms/${roomId}?v=${versionRef.current}`, { cache: 'no-store' });
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
  }, [view?.version]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      const sentAt = Date.now();
      const res = await fetch(`/api/rooms/${roomId}`, {
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
      const next: Seat = { token: data.token, side: data.side };
      saveSeat(roomId, next);
      setSeat(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join');
    } finally {
      setBusy(false);
    }
  };

  const submitMove = useCallback(
    async (move: unknown) => {
      if (!seat) return;
      setBusy(true);
      try {
        await post({ action: 'move', token: seat.token, move });
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Move rejected');
        fetchRoom(); // resync with the server's version of the game
      } finally {
        setBusy(false);
      }
    },
    [seat, post, fetchRoom],
  );

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

  if (notFound) {
    return (
      <div className={online.lobby}>
        <h1 className={online.heading}>Game not found</h1>
        <p className={online.notice}>This game does not exist or has expired (games are kept for a day).</p>
        <Link href={`/${def.id}/online`} className={online.link}>
          Start a new game
        </Link>
      </div>
    );
  }

  if (!view) {
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

  const [first, second] = def.sides;
  const mySide = seat?.side ?? null;
  const toMove = def.turn(view.state);
  const playing = view.status === 'playing';
  const myTurn = playing && mySide === toMove;
  const timed = view.clock.control !== null;
  const freeSide = def.sides.find((s) => !view.seats[s]) ?? null;
  const canJoin = !mySide && freeSide !== null && view.status === 'waiting';
  const spectating = !mySide && !canJoin;
  const timeLabel = TIME_CONTROLS.find((t) => t.id === view.timeControlId)?.label ?? view.timeControlId;
  const flipped = def.flippable ? (flippedOverride ?? mySide === second) : false;

  const panel = (side: string) => {
    const left = remaining(view.clock, clockSlot(def, side), estNow);
    const active = playing && toMove === side;
    return (
      <div className={`${styles.panel} ${active ? styles.panelActive : ''}`}>
        <span className={styles.name}>
          <span className={styles.dot} style={{ background: DOT_COLOR[side] }} />
          {def.sideNames[side]}
          {mySide === side && <span className={online.you}>(you)</span>}
          {!view.seats[side] && <span className={online.you}>waiting…</span>}
        </span>
        {timed && (
          <span
            className={`${styles.clock} ${left < 10_000 ? styles.clockLow : ''}`}
            aria-label={`${def.sideNames[side]} time`}
          >
            {formatClock(left)}
          </span>
        )}
      </div>
    );
  };

  // Numbered rows: the side that moves first, then its opponent.
  const notation = def.notation(view.state);
  const rows: { no: number; a: string; b?: string }[] = [];
  notation.forEach((text, i) => {
    if (i % 2 === 0) rows.push({ no: i / 2 + 1, a: text });
    else rows[rows.length - 1].b = text;
  });

  let banner: string | null = null;
  if (view.result) {
    const text = describeResult(def, view.result);
    banner =
      mySide && view.result.winner
        ? `${view.result.winner === mySide ? 'You won' : 'You lost'}: ${text}`
        : text;
  } else if (playing) {
    const note = def.note(view.state);
    const suffix = note ? ` (${note})` : '';
    banner = mySide
      ? `${myTurn ? 'Your move' : "Opponent's move"}${suffix}`
      : `${def.sideNames[toMove]} to move${suffix}`;
  }

  // Each side sees its own pieces at the bottom.
  const topSide = flipped ? first : second;
  const bottomSide = flipped ? second : first;

  return (
    <div className={styles.game}>
      {canJoin && (
        <div className={online.invite}>
          <p>
            You&apos;ve been invited to a game of {def.title} ({timeLabel}).
          </p>
          <span>You would play {def.sideNames[freeSide!]}.</span>
          <button type="button" className={online.primary} onClick={joinGame} disabled={busy}>
            Join game
          </button>
        </div>
      )}

      {spectating && <p className={online.notice}>This game is full. You are watching.</p>}

      {mySide && view.status === 'waiting' && (
        <div className={online.invite}>
          <p>Send this link to your opponent</p>
          <input readOnly value={window.location.href} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
          <button type="button" className={online.primary} onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      )}

      {panel(topSide)}

      {/* Remounted on every change so half-finished selections never go stale. */}
      <Board
        key={view.version}
        state={view.state}
        mySide={mySide}
        canMove={myTurn && !busy}
        disabled={view.status === 'finished'}
        flipped={flipped}
        onMove={submitMove}
      />

      {panel(bottomSide)}

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
        {def.flippable && (
          <button type="button" onClick={() => setFlippedOverride(!flipped)}>
            Flip board
          </button>
        )}
        <button type="button" onClick={copyLink}>
          {copied ? 'Copied!' : 'Copy invite link'}
        </button>
        <button type="button" onClick={resign} disabled={!mySide || !playing || busy}>
          Resign
        </button>
        <Link href={`/${def.id}/online`} className={online.link}>
          New game
        </Link>
      </div>

      <div className={styles.moves} ref={movesRef} aria-label="Move list">
        {rows.length === 0 ? (
          <span className={styles.movesEmpty}>No moves yet. {def.sideNames[first]} to start.</span>
        ) : (
          rows.map((r) => (
            <div key={r.no} className={styles.moveRow}>
              <span className={styles.moveNo}>{r.no}.</span>
              <span>{r.a}</span>
              <span>{r.b ?? ''}</span>
            </div>
          ))
        )}
      </div>

      <p className={styles.hint}>
        Game code <strong>{view.id}</strong>
        {timed ? ' · clocks start after the first move' : ''}
      </p>
    </div>
  );
}
