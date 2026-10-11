'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Board from './Board';
import type { Difficulty } from '@/engines/core/types';
import { findWrongCells, sudokuEngine, type SudokuState } from '@/engines/sudoku/engine';
import { findConflicts } from '@/engines/sudoku/grid';
import {
  clearCellNotes,
  clearPeerNotes,
  emptyNotes,
  toggleNote,
  type Notes,
} from '@/engines/sudoku/notes';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'expert'];
type Status = 'loading' | 'playing' | 'won';

function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export default function SudokuGame() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [seed, setSeed] = useState<string | null>(null);
  const [solution, setSolution] = useState<SudokuState | null>(null);
  const [state, setState] = useState<SudokuState | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [notes, setNotes] = useState<Notes>(emptyNotes);
  const [notesMode, setNotesMode] = useState(false);
  const [status, setStatus] = useState<Status>('loading');
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);

  const newGame = useCallback((d: Difficulty) => {
    const nextSeed = randomSeed();
    const { puzzle, solution } = sudokuEngine.generate(d, nextSeed);
    setSeed(nextSeed);
    setSolution(solution);
    setState(puzzle);
    setSelected(null);
    setMistakes(0);
    setNotes(emptyNotes());
    setNotesMode(false);
    setElapsed(0);
    startedAt.current = Date.now();
    setStatus('playing');
  }, []);

  // Generate the first puzzle on the client only (random seed, so not on the server).
  useEffect(() => {
    newGame('easy');
  }, [newGame]);

  // Timer: derive from wall-clock time so it never drifts.
  useEffect(() => {
    if (status !== 'playing') return;
    const id = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(id);
  }, [status]);

  const place = useCallback(
    (value: number) => {
      if (status !== 'playing' || !state || !solution || selected === null) return;
      const move = { index: selected, value };
      if (!sudokuEngine.validateMove(state, move).ok) return;

      const cellIsEmpty = state.cells[selected] === 0;

      // Pencil mode: digits toggle notes, only on empty cells.
      if (notesMode && value !== 0) {
        if (cellIsEmpty) setNotes((prev) => toggleNote(prev, selected, value));
        return;
      }

      // Erase on an empty cell clears its notes instead.
      if (value === 0 && cellIsEmpty) {
        setNotes((prev) => clearCellNotes(prev, selected));
        return;
      }

      const next = sudokuEngine.applyMove(state, move);
      setState(next);
      if (value !== 0) {
        // Placing a digit clears this cell's notes and that digit from its peers.
        setNotes((prev) => clearPeerNotes(prev, selected, value));
        if (value !== solution.cells[selected]) setMistakes((m) => m + 1);
      }
      if (sudokuEngine.isComplete(next)) {
        setElapsed(Date.now() - startedAt.current);
        setStatus('won');
      }
    },
    [status, state, solution, selected, notesMode],
  );

  // Keyboard: digits, backspace/delete, arrows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[1-9]$/.test(e.key)) {
        place(Number(e.key));
      } else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') {
        place(0);
      } else if (e.key === 'n' || e.key === 'N') {
        setNotesMode((m) => !m);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        setSelected((cur) => {
          if (cur === null) return 0;
          const r = Math.floor(cur / 9);
          const c = cur % 9;
          if (e.key === 'ArrowUp') return Math.max(r - 1, 0) * 9 + c;
          if (e.key === 'ArrowDown') return Math.min(r + 1, 8) * 9 + c;
          if (e.key === 'ArrowLeft') return r * 9 + Math.max(c - 1, 0);
          return r * 9 + Math.min(c + 1, 8);
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [place]);

  const conflicts = useMemo(
    () => (state ? findConflicts(state.cells) : new Set<number>()),
    [state],
  );

  const wrong = useMemo(
    () => (state && solution ? findWrongCells(state, solution) : new Set<number>()),
    [state, solution],
  );

  const progress = useMemo(
    () => (state && solution ? sudokuEngine.progress(state, solution) : 0),
    [state, solution],
  );

  // Remaining count per digit, for the number pad.
  const remaining = useMemo(() => {
    const counts = new Array<number>(10).fill(9);
    state?.cells.forEach((v) => {
      if (v) counts[v]--;
    });
    return counts;
  }, [state]);

  if (!state) {
    return <div className="game game-loading">Generating puzzle…</div>;
  }

  return (
    <div className="game">
      <header className="topbar">
        <div className="clock" aria-live="off">
          <span className="clock-time">{formatTime(elapsed)}</span>
          <span className="clock-label">
            {mistakes} {mistakes === 1 ? 'mistake' : 'mistakes'}
          </span>
        </div>
        <div className="controls">
          <label className="visually-hidden" htmlFor="difficulty">
            Difficulty
          </label>
          <select
            id="difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as Difficulty)}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {d[0].toUpperCase() + d.slice(1)}
              </option>
            ))}
          </select>
          <button type="button" className="primary" onClick={() => newGame(difficulty)}>
            New game
          </button>
        </div>
      </header>

      <div
        className="progress"
        role="progressbar"
        aria-label="Puzzle progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="board-wrap">
        <Board
          state={state}
          selected={selected}
          conflicts={conflicts}
          wrong={wrong}
          notes={notes}
          disabled={status === 'won'}
          onSelect={setSelected}
        />
        {status === 'won' && (
          <div className="win" role="status">
            <h2>Solved in {formatTime(elapsed)}</h2>
            <p>
              {mistakes === 0
                ? 'No mistakes.'
                : `${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'} along the way.`}
            </p>
            <button type="button" className="primary" onClick={() => newGame(difficulty)}>
              Play again
            </button>
          </div>
        )}
      </div>

      <div className="tools">
        <button
          type="button"
          className="notes-toggle"
          aria-pressed={notesMode}
          onClick={() => setNotesMode((m) => !m)}
          disabled={status !== 'playing'}
        >
          Notes: {notesMode ? 'On' : 'Off'}
        </button>
        <button
          type="button"
          onClick={() => place(0)}
          disabled={status !== 'playing' || selected === null}
        >
          Erase
        </button>
      </div>

      <div className="pad" aria-label="Number pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => place(n)}
            disabled={status !== 'playing' || selected === null || remaining[n] <= 0}
            aria-label={`Place ${n}`}
          >
            <span className="pad-digit">{n}</span>
            <span className="pad-left">{remaining[n]}</span>
          </button>
        ))}
      </div>

      <p className="hint">Click a cell, then type 1–9. Arrow keys move, Backspace erases, N toggles pencil notes.</p>
      {seed && <p className="seed">Seed {seed}</p>}
    </div>
  );
}