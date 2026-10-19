/**
 * English / American checkers (draughts) on an 8x8 board.
 *
 * - Black moves first. Pieces live on the dark squares (a1 is dark).
 * - Men move one step diagonally forward; kings one step in any diagonal direction.
 * - Captures are mandatory. A capturing piece must keep jumping while it can.
 * - Men capture forward only. A man that reaches the far row becomes a king and
 *   its move ends there.
 * - You lose if you have no pieces or no legal move.
 * - Draws: the same position (with the same side to move) three times, or 40 moves
 *   by each side (80 plies) without a capture or a man moving.
 */

export type Side = 'w' | 'b';
export type Square = `${'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h'}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;

export const FILES = 'abcdefgh';
export const DRAW_PLY_LIMIT = 80;

/** Index 0 is a1, 7 is h1, 8 is a2 ... 63 is h8. */
export const idxOf = (sq: string): number => (Number(sq[1]) - 1) * 8 + (sq.charCodeAt(0) - 97);
export const squareOf = (idx: number): Square =>
  `${FILES[idx % 8]}${Math.floor(idx / 8) + 1}` as Square;
export const isDark = (idx: number): boolean => ((idx % 8) + Math.floor(idx / 8)) % 2 === 0;

// Board characters: '.' empty, 'b'/'B' black man/king, 'w'/'W' white man/king.
export const sideOf = (ch: string): Side | null =>
  ch === 'b' || ch === 'B' ? 'b' : ch === 'w' || ch === 'W' ? 'w' : null;
export const isKing = (ch: string): boolean => ch === 'B' || ch === 'W';
export const other = (s: Side): Side => (s === 'b' ? 'w' : 'b');

export interface CheckersMove {
  /** The starting square followed by every landing square. */
  path: Square[];
}

export interface LegalMove extends CheckersMove {
  captures: Square[];
  promotes: boolean;
}

export interface MoveRecord {
  path: Square[];
  captures: Square[];
  side: Side;
  promoted: boolean;
  /** "c3-d4" for a step, "c3xe5xg7" for a capture. */
  notation: string;
}

/** Serializable game state (safe to store or send to a server). */
export interface CheckersState {
  /** 64 characters, a1 first. See the board characters above. */
  board: string;
  turn: Side;
  /** Plies since the last capture or man move. */
  quietPlies: number;
  /** Position keys (board + side to move) after every ply, including the start. */
  history: string[];
  moves: MoveRecord[];
}

export type DrawReason = 'repetition' | 'forty-move';

export type GameStatus =
  | { kind: 'playing' }
  | { kind: 'win'; winner: Side; reason: 'no-moves' | 'no-pieces' }
  | { kind: 'draw'; reason: DrawReason };

export interface MoveResult {
  ok: boolean;
  reason?: string;
}

const positionKey = (board: string, turn: Side) => `${board}${turn}`;

function initialBoard(): string {
  let board = '';
  for (let idx = 0; idx < 64; idx++) {
    const rankIndex = Math.floor(idx / 8);
    if (isDark(idx) && rankIndex <= 2) board += 'b';
    else if (isDark(idx) && rankIndex >= 5) board += 'w';
    else board += '.';
  }
  return board;
}

function stateFrom(board: string, turn: Side): CheckersState {
  return { board, turn, quietPlies: 0, history: [positionKey(board, turn)], moves: [] };
}

export function createGame(): CheckersState {
  return stateFrom(initialBoard(), 'b');
}

/**
 * Build a position from a diagram, top row (rank 8) first, eight characters per row,
 * using '.', 'b', 'B', 'w', 'W'. Handy for tests and puzzles.
 */
export function parseBoard(rows: string[], turn: Side = 'b'): CheckersState {
  if (rows.length !== 8 || rows.some((r) => r.length !== 8)) {
    throw new RangeError('A board needs 8 rows of 8 characters');
  }
  const cells = new Array<string>(64).fill('.');
  rows.forEach((row, i) => {
    const rankIndex = 7 - i;
    [...row].forEach((ch, file) => {
      if (!'.bBwW'.includes(ch)) throw new RangeError(`Invalid character: ${ch}`);
      const idx = rankIndex * 8 + file;
      if (ch !== '.' && !isDark(idx)) throw new RangeError(`Piece on a light square: ${squareOf(idx)}`);
      cells[idx] = ch;
    });
  });
  return stateFrom(cells.join(''), turn);
}

export function countPieces(board: string): { b: number; w: number; bKings: number; wKings: number } {
  const counts = { b: 0, w: 0, bKings: 0, wKings: 0 };
  for (const ch of board) {
    if (ch === 'b') counts.b++;
    else if (ch === 'B') (counts.b++, counts.bKings++);
    else if (ch === 'w') counts.w++;
    else if (ch === 'W') (counts.w++, counts.wKings++);
  }
  return counts;
}

type Dir = [number, number]; // [rank step, file step]
const ALL_DIRS: Dir[] = [
  [1, -1],
  [1, 1],
  [-1, -1],
  [-1, 1],
];
const BLACK_FORWARD: Dir[] = [
  [1, -1],
  [1, 1],
];
const WHITE_FORWARD: Dir[] = [
  [-1, -1],
  [-1, 1],
];

const dirsFor = (side: Side, king: boolean): Dir[] =>
  king ? ALL_DIRS : side === 'b' ? BLACK_FORWARD : WHITE_FORWARD;
const kingRow = (side: Side) => (side === 'b' ? 7 : 0);
const inBounds = (r: number, f: number) => r >= 0 && r < 8 && f >= 0 && f < 8;

interface Jump {
  path: number[];
  captures: number[];
  promotes: boolean;
}

/** Every complete capture sequence for the piece on `start`. */
function jumpSequences(cells: string[], start: number): Jump[] {
  const ch = cells[start];
  const side = sideOf(ch)!;
  const out: Jump[] = [];

  // Work on a copy with the mover lifted off its square, so it may land back on it.
  // Captured pieces stay on the board until the move ends: they cannot be jumped
  // twice and they block landing squares.
  const work = cells.slice();
  work[start] = '.';

  const dfs = (pos: number, path: number[], caps: number[], king: boolean) => {
    let extended = false;
    const r = Math.floor(pos / 8);
    const f = pos % 8;
    for (const [dr, df] of dirsFor(side, king)) {
      const lr = r + 2 * dr;
      const lf = f + 2 * df;
      if (!inBounds(lr, lf)) continue;
      const over = (r + dr) * 8 + (f + df);
      const land = lr * 8 + lf;
      if (sideOf(work[over]) === other(side) && !caps.includes(over) && work[land] === '.') {
        extended = true;
        const newPath = [...path, land];
        const newCaps = [...caps, over];
        if (!king && lr === kingRow(side)) {
          // A man that reaches the far row is crowned and its move ends.
          out.push({ path: newPath, captures: newCaps, promotes: true });
        } else {
          dfs(land, newPath, newCaps, king);
        }
      }
    }
    if (!extended && path.length > 1) out.push({ path, captures: caps, promotes: false });
  };

  dfs(start, [start], [], isKing(ch));
  return out;
}

function generate(board: string, side: Side): LegalMove[] {
  const cells = [...board];
  const jumps: LegalMove[] = [];
  const steps: LegalMove[] = [];

  for (let idx = 0; idx < 64; idx++) {
    const ch = cells[idx];
    if (sideOf(ch) !== side) continue;

    for (const j of jumpSequences(cells, idx)) {
      jumps.push({
        path: j.path.map(squareOf),
        captures: j.captures.map(squareOf),
        promotes: j.promotes,
      });
    }

    const r = Math.floor(idx / 8);
    const f = idx % 8;
    for (const [dr, df] of dirsFor(side, isKing(ch))) {
      const tr = r + dr;
      const tf = f + df;
      if (inBounds(tr, tf) && cells[tr * 8 + tf] === '.') {
        steps.push({
          path: [squareOf(idx), squareOf(tr * 8 + tf)],
          captures: [],
          promotes: !isKing(ch) && tr === kingRow(side),
        });
      }
    }
  }

  // Captures are mandatory.
  return jumps.length > 0 ? jumps : steps;
}

/** All legal moves for the side to move. If any capture exists, only captures are returned. */
export function legalMoves(state: CheckersState): LegalMove[] {
  return generate(state.board, state.turn);
}

export const samePath = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((sq, i) => sq === b[i]);

export const startsWithPath = (path: readonly string[], prefix: readonly string[]): boolean =>
  prefix.length <= path.length && prefix.every((sq, i) => sq === path[i]);

export function getStatus(state: CheckersState): GameStatus {
  const counts = countPieces(state.board);
  if (counts[state.turn] === 0) {
    return { kind: 'win', winner: other(state.turn), reason: 'no-pieces' };
  }
  if (legalMoves(state).length === 0) {
    return { kind: 'win', winner: other(state.turn), reason: 'no-moves' };
  }
  const key = state.history[state.history.length - 1];
  if (state.history.filter((k) => k === key).length >= 3) {
    return { kind: 'draw', reason: 'repetition' };
  }
  if (state.quietPlies >= DRAW_PLY_LIMIT) return { kind: 'draw', reason: 'forty-move' };
  return { kind: 'playing' };
}

export function validateMove(state: CheckersState, move: CheckersMove): MoveResult {
  if (getStatus(state).kind !== 'playing') return { ok: false, reason: 'The game is over' };
  const legal = legalMoves(state);
  if (legal.some((m) => samePath(m.path, move.path))) return { ok: true };
  if (legal.some((m) => m.path.length > move.path.length && startsWithPath(m.path, move.path))) {
    return { ok: false, reason: 'You must keep jumping' };
  }
  if (legal.length > 0 && legal[0].captures.length > 0) {
    return { ok: false, reason: 'A capture is mandatory' };
  }
  return { ok: false, reason: 'Illegal move' };
}

/** Pure: returns a new state. Throws on an illegal move. */
export function applyMove(state: CheckersState, move: CheckersMove): CheckersState {
  const check = validateMove(state, move);
  if (!check.ok) throw new Error(check.reason);

  const legal = legalMoves(state).find((m) => samePath(m.path, move.path))!;
  const cells = [...state.board];
  const from = idxOf(legal.path[0]);
  const to = idxOf(legal.path[legal.path.length - 1]);
  const piece = cells[from];

  cells[from] = '.';
  for (const sq of legal.captures) cells[idxOf(sq)] = '.';
  cells[to] = legal.promotes ? piece.toUpperCase() : piece;

  const board = cells.join('');
  const turn = other(state.turn);
  const resetsClock = legal.captures.length > 0 || !isKing(piece);

  const record: MoveRecord = {
    path: legal.path,
    captures: legal.captures,
    side: state.turn,
    promoted: legal.promotes,
    notation: legal.path.join(legal.captures.length > 0 ? 'x' : '-'),
  };

  return {
    board,
    turn,
    quietPlies: resetsClock ? 0 : state.quietPlies + 1,
    history: [...state.history, positionKey(board, turn)],
    moves: [...state.moves, record],
  };
}