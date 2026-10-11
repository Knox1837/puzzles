# Puzzle Engine

A timed puzzle game built with Next.js and TypeScript. Sudoku is the first puzzle, and the codebase is structured so more puzzle types can be added later, along with competitive modes (PvE leaderboards and PvP).

## Status

Playable single-player Sudoku prototype.

**Working now**

- Seeded puzzle generation with a guaranteed unique solution
- Four difficulty levels (easy, medium, hard, expert)
- Timer, mistake counter and progress bar
- Pencil notes, with automatic clean-up of notes when a digit is placed
- Highlighting of the selected cell's row, column and box, matching digits, rule conflicts and wrong digits
- Keyboard and on-screen number pad input
- Light and dark theme

**Not built yet**

- Hints, undo and pause
- Server-side timing and leaderboards (PvE)
- Realtime matches (PvP)
- Additional puzzle types
- Deployment

The timer, solution and mistake count currently run in the browser, so scores can be tampered with. Anything ranked will need to move to the server.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

### Scripts

| Command             | What it does                      |
| ------------------- | --------------------------------- |
| `npm run dev`       | Start the dev server              |
| `npm run build`     | Create a production build         |
| `npm start`         | Serve the production build        |
| `npm test`          | Run the engine tests (Vitest)     |
| `npm run typecheck` | Type-check without emitting files |

## Controls

| Input          | Action                                    |
| -------------- | ----------------------------------------- |
| Click a cell   | Select it                                 |
| `1`–`9`        | Place a digit (or toggle a note in notes mode) |
| `Backspace` / `Delete` / `0` | Erase the digit, or the notes if the cell is empty |
| Arrow keys     | Move the selection                        |
| `N`            | Toggle pencil notes                       |

## Project structure

```
src/
  app/                  Next.js app router (layout, page, global styles)
  components/
    Board.tsx           Renders the 81 cells; no game logic
    SudokuGame.tsx      Game state, timer, keyboard input, controls
  engines/
    core/
      types.ts          PuzzleEngine interface shared by all puzzles
      rng.ts            Seeded random number generator and shuffle
    sudoku/
      grid.ts           Grid helpers, conflict detection, serialize/parse
      solver.ts         Backtracking solver and solution counting
      generator.ts      Seeded puzzle generator
      engine.ts         Sudoku implementation of PuzzleEngine
      notes.ts          Pencil-note helpers
    index.ts            Engine registry
tests/                  Vitest tests for the engine
```

## How the engine works

Every puzzle type implements the same interface (`src/engines/core/types.ts`):

```ts
interface PuzzleEngine<State, Move> {
  id: string;
  generate(difficulty, seed): { puzzle: State; solution: State };
  validateMove(state, move): { ok: boolean; reason?: string };
  applyMove(state, move): State;          // pure, returns a new state
  isComplete(state): boolean;
  progress(state, solution): number;      // 0..1
}
```

Timers, scoring, matchmaking and leaderboards should only depend on this interface, never on Sudoku specifics.

**Sudoku details**

- **Generation:** a full grid is built with randomised backtracking, then cells are removed in random order while a solver confirms the puzzle still has exactly one solution. The same seed and difficulty always produce the same puzzle.
- **Difficulty:** graded by clue count (easy 40, medium 34, hard 29, expert 25). This is a simple grade; technique-based grading is a possible future improvement.
- **Move validation** is structural only (bounds, locked given cells). Wrong digits are detected separately with `findWrongCells` and `countMistakes`, and rule conflicts with `findConflicts`.
- **Board format:** cells are a flat array of 81 numbers (0 for empty). `serialize` and `parse` convert to and from an 81-character string for storage.

## Adding a new puzzle

1. Create `src/engines/<puzzle>/` with an engine implementing `PuzzleEngine`.
2. Register it in `src/engines/index.ts`.
3. Add a board component and a game component for it under `src/components/`.
4. Add tests under `tests/`.

## Testing

```bash
npm test
```

The tests cover the seeded RNG, the solver, the generator (determinism, validity, unique solutions, difficulty ordering), the engine (moves, completion, progress, mistakes) and the notes helpers.

## Roadmap

1. Hints, undo and pause
2. Server-side PvE: API routes that issue puzzles and validate results, with a database-backed leaderboard
3. PvP: rooms, matchmaking and a realtime layer
4. A second puzzle type to prove the engine abstraction
5. Deployment to Vercel

### Deployment notes

The Next.js app is to be deployed to vercel directly. Vercel serverless functions cannot hold persistent WebSocket connections, so PvP will need a managed realtime service (Ably, Pusher, Supabase Realtime, Liveblocks or PartyKit) or a separate realtime server. Keep secrets in environment variables and out of git.