# Puzzle Engine

A small game platform built with Next.js and TypeScript. It currently has two games: a timed **Sudoku** (solo) and **Chess** (two players on one device, with optional clocks). The code is structured so more puzzles and games can be added, along with online play and leaderboards.

## Status

**Sudoku** (`/sudoku`): playable solo prototype.

- Seeded puzzle generation with a guaranteed unique solution
- Four difficulty levels (easy, medium, hard, expert)
- Timer, mistake counter and progress bar
- Pencil notes, with automatic clean-up of notes when a digit is placed
- Highlighting of the selected cell's row, column and box, matching digits, rule conflicts and wrong digits

**Chess** (`/chess`): two players on one device.

- Full rules: check, checkmate, castling, en passant and promotion (with a piece picker)
- Automatic draws: stalemate, insufficient material, threefold repetition and the fifty-move rule
- Optional clocks (1, 3, 5, 10 minutes, or 3 | 2 and 15 | 10 with increment); a player who runs out of time loses
- Resign buttons, board flip and a move list in standard notation

**Not built yet**

- Online play (realtime PvP), accounts and matchmaking
- Server-side timing and leaderboards for Sudoku
- Sudoku hints, undo and pause
- Chess draw offers, takebacks, drag-and-drop and move history review
- More puzzle types
- Deployment

Everything runs in the browser for now, so Sudoku scores and solutions can be tampered with. Anything ranked will need to move to the server.

## Getting started

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:3000. The home page lists the games.

### Scripts

| Command             | What it does                      |
| ------------------- | --------------------------------- |
| `npm run dev`       | Start the dev server              |
| `npm run build`     | Create a production build         |
| `npm start`         | Serve the production build        |
| `npm test`          | Run the engine tests (Vitest)     |
| `npm run typecheck` | Type-check without emitting files |

## Controls

### Sudoku

| Input                        | Action                                             |
| ---------------------------- | -------------------------------------------------- |
| Click a cell                 | Select it                                          |
| `1`–`9`                      | Place a digit (or toggle a note in notes mode)     |
| `Backspace` / `Delete` / `0` | Erase the digit, or the notes if the cell is empty |
| Arrow keys                   | Move the selection                                 |
| `N`                          | Toggle pencil notes                                |

### Chess

| Input                         | Action                                           |
| ----------------------------- | ------------------------------------------------ |
| Click a piece, then a square  | Move (legal squares are highlighted)             |
| Click the selected piece      | Deselect                                         |
| Resign / Flip board / New game | Buttons below and beside the board              |

Clocks start after White's first move. Changing the time control before the first move applies immediately; otherwise it applies to the next new game.

## Project structure

```
src/
  app/
    page.tsx                Game menu
    home.module.css
    sudoku/page.tsx         Sudoku route
    chess/page.tsx          Chess route
    layout.tsx, globals.css
  components/
    PageShell.tsx           Shared page wrapper with a back link
    Board.tsx               Sudoku board (no game logic)
    SudokuGame.tsx          Sudoku state, timer, input, controls
    chess/
      ChessBoard.tsx        Chess board rendering
      ChessGame.tsx         Chess state, clocks, move handling, controls
      chess.module.css
  engines/
    core/                   PuzzleEngine interface, seeded RNG
    sudoku/                 grid, solver, generator, engine, notes
    chess/                  engine (chess.js wrapper) and clock
    index.ts                Registry of puzzle engines
tests/                      Vitest tests for the engines
```

## How the engines work

### Puzzles (Sudoku)

Puzzle types implement the interface in `src/engines/core/types.ts`:

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

- **Generation:** a full grid is built with randomised backtracking, then cells are removed in random order while a solver confirms the puzzle still has exactly one solution. The same seed and difficulty always produce the same puzzle.
- **Difficulty:** graded by clue count (easy 40, medium 34, hard 29, expert 25). Technique-based grading is a possible future improvement.
- **Move validation** is structural only (bounds, locked givens). Wrong digits are detected with `findWrongCells` and `countMistakes`, and rule conflicts with `findConflicts`.
- **Board format:** a flat array of 81 numbers (0 for empty). `serialize` and `parse` convert to and from an 81-character string.
- **Notes** are UI state, kept outside the engine's state, as one bitmask per cell.

### Chess

Chess is not a generated puzzle, so it has its own engine in `src/engines/chess/` instead of implementing `PuzzleEngine`.

- **Rules** come from [chess.js](https://github.com/jhlywa/chess.js), wrapped by our own functions (`createGame`, `legalMoves`, `applyMove`, `getStatus` and so on) so the rest of the app does not depend on the library.
- **State** is the starting position plus the list of moves played. This is what makes threefold repetition detectable, and it is a natural format to store or sync with a server for online play.
- **Clocks** (`clock.ts`) are pure functions that take the current timestamp as an argument, which keeps them easy to test. The first move is free: it starts the opponent's clock. Increments are added after each later move.

## Adding another game

- **A puzzle with a generated solution:** add `src/engines/<puzzle>/` implementing `PuzzleEngine`, register it in `src/engines/index.ts`, add a board and game component, add a route under `src/app/<puzzle>/page.tsx` and a card on the menu, and write tests.
- **A turn-based game like chess:** follow the chess layout (engine, components, route). A shared interface for turn-based games is worth extracting when online play is built.

## Testing

```bash
npm test
```

The tests cover the seeded RNG, the Sudoku solver, generator, engine and notes helpers, the chess engine (legal moves, checkmate, castling, en passant, promotion and every draw type) and the chess clock.

## Roadmap

1. Online chess: rooms, a realtime layer and server-validated moves
2. Server-side Sudoku PvE with a database-backed leaderboard
3. Sudoku hints, undo and pause
4. Chess draw offers, takebacks and an opponent bot
5. More puzzle types
6. Deployment to Vercel

### Deployment notes

The Next.js app deploys to Vercel as-is. Vercel serverless functions cannot hold persistent WebSocket connections, so online play will need a managed realtime service (Ably, Pusher, Supabase Realtime, Liveblocks or PartyKit) or a separate realtime server. Keep secrets in environment variables and out of git.