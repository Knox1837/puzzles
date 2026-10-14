'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIME_CONTROLS } from '@/engines/chess/clock';
import type { Color } from '@/engines/chess/engine';
import { saveSeat } from './seat';
import styles from './online.module.css';

type ColorChoice = 'random' | Color;

const COLOR_CHOICES: { id: ColorChoice; label: string }[] = [
  { id: 'w', label: 'White' },
  { id: 'random', label: 'Random' },
  { id: 'b', label: 'Black' },
];

/** Accepts a bare code or a pasted link and returns just the code. */
function extractCode(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  return (trimmed.split('/').pop() ?? '').toLowerCase();
}

export default function OnlineLobby() {
  const router = useRouter();
  const [tcId, setTcId] = useState('10+0');
  const [color, setColor] = useState<ColorChoice>('random');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/chess/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeControlId: tcId, color }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not create the game');
      saveSeat(data.id, { token: data.token, color: data.color });
      router.push(`/chess/online/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the game');
      setBusy(false);
    }
  };

  const join = () => {
    const id = extractCode(code);
    if (id) router.push(`/chess/online/${id}`);
  };

  return (
    <div className={styles.lobby}>
      <h1 className={styles.heading}>Chess online</h1>

      <section className={styles.card} aria-label="Create a game">
        <h2>Start a game</h2>
        <label className={styles.field}>
          Time control
          <select value={tcId} onChange={(e) => setTcId(e.target.value)}>
            {TIME_CONTROLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.field}>
          Play as
          <div className={styles.row}>
            {COLOR_CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={styles.choice}
                aria-pressed={color === c.id}
                onClick={() => setColor(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className={styles.primary} onClick={create} disabled={busy}>
          {busy ? 'Creating…' : 'Create game and get invite link'}
        </button>
      </section>

      <section className={styles.card} aria-label="Join a game">
        <h2>Join a game</h2>
        <label className={styles.field}>
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
        <button type="button" className={styles.primary} onClick={join} disabled={!extractCode(code)}>
          Join
        </button>
      </section>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}