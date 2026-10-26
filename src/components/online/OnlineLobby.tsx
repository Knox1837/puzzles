'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TIME_CONTROLS } from '@/engines/chess/clock';
import { findGame } from '@/engines/online/games';
import { saveSeat } from './seat';
import online from '../chess/online.module.css';

/** Accepts a bare code or a pasted link and returns just the code. */
function extractCode(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  return (trimmed.split('/').pop() ?? '').toLowerCase();
}

export default function OnlineLobby({ game }: { game: string }) {
  const def = findGame(game);
  const router = useRouter();
  const [tcId, setTcId] = useState('10+0');
  const [side, setSide] = useState<string>('random');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const choices = [
    { id: def.sides[0], label: def.sideNames[def.sides[0]] },
    { id: 'random', label: 'Random' },
    { id: def.sides[1], label: def.sideNames[def.sides[1]] },
  ];

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game: def.id, timeControlId: tcId, side }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not create the game');
      saveSeat(data.id, { token: data.token, side: data.side });
      router.push(`/${def.id}/online/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the game');
      setBusy(false);
    }
  };

  const join = () => {
    const id = extractCode(code);
    if (id) router.push(`/${def.id}/online/${id}`);
  };

  return (
    <div className={online.lobby}>
      <h1 className={online.heading}>{def.title} online</h1>

      <section className={online.card} aria-label="Create a game">
        <h2>Start a game</h2>
        <label className={online.field}>
          Time control
          <select value={tcId} onChange={(e) => setTcId(e.target.value)}>
            {TIME_CONTROLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className={online.field}>
          Play as
          <div className={online.row}>
            {choices.map((c) => (
              <button
                key={c.id}
                type="button"
                className={online.choice}
                aria-pressed={side === c.id}
                onClick={() => setSide(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className={online.primary} onClick={create} disabled={busy}>
          {busy ? 'Creating…' : 'Create game and get invite link'}
        </button>
      </section>

      <section className={online.card} aria-label="Join a game">
        <h2>Join a game</h2>
        <label className={online.field}>
          Game code or link
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && join()}
            placeholder="e.g. k7m2x9pq"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
        <button type="button" className={online.primary} onClick={join} disabled={!extractCode(code)}>
          Join
        </button>
      </section>

      {error && (
        <p className={online.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
