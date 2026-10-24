/**
 * Connect Four: 7 columns by 6 rows. Players alternate dropping a disc into a column; it falls to the lowest free space. First to line up four of their discs horizontally, vertically or diagonally wins. A full board is a draw. Red moves first.
 */

export type Disc = 'r' | 'y';

export const COLS = 7;
export const ROWS = 6;
export const CELLS = COLS * ROWS;

/** Row 0 is the bottom row. Index = row * 7 + column. */
export const cellIndex = (row: number, col: number): number => row * COLS + col;
export const other = (d: Disc): Disc => (d === 'r' ? 'y' : 'r');

export interface ConnectFourMove {
  /** Column 0 (left) to 6 (right). */
  column: number;
}

/** Serializable game state (safe to store or send to a server). */
export interface ConnectFourState {
  /** 42 characters: '.' empty, 'r' red, 'y' yellow. */
  board: string;
  turn: Disc;
  /** Column of every move played, in order. */
  moves: number[];
}

export type GameStatus =
  | { kind: 'playing' }
  | { kind: 'win'; winner: Disc; line: number[] }
  | { kind: 'draw' };

export interface MoveResult {
  ok: boolean;
  reason?: string;
}

export function createGame(): ConnectFourState {
  return { board: '.'.repeat(CELLS), turn: 'r', moves: [] };
}

/**
 * Build a position from a diagram, top row first, seven characters per row,
 * using '.', 'r' and 'y'. Discs must rest on the floor or on another disc.
 * Handy for tests. `turn` defaults to whoever is next given the disc counts.
 */
export function parseBoard(rows: string[], turn?: Disc): ConnectFourState {
  if (rows.length !== ROWS || rows.some((r) => r.length !== COLS)) {
    throw new RangeError(`A board needs ${ROWS} rows of ${COLS} characters`);
  }
  const cells = new Array<string>(CELLS).fill('.');
  rows.forEach((row, i) => {
    const r = ROWS - 1 - i;
    [...row].forEach((ch, c) => {
      if (!'.ry'.includes(ch)) throw new RangeError(`Invalid character: ${ch}`);
      cells[cellIndex(r, c)] = ch;
    });
  });
  for (let c = 0; c < COLS; c++) {
    for (let r = 1; r < ROWS; r++) {
      if (cells[cellIndex(r, c)] !== '.' && cells[cellIndex(r - 1, c)] === '.') {
        throw new RangeError(`Floating disc in column ${c + 1}`);
      }
    }
  }
  const reds = cells.filter((x) => x === 'r').length;
  const yellows = cells.filter((x) => x === 'y').length;
  return { board: cells.join(''), turn: turn ?? (reds <= yellows ? 'r' : 'y'), moves: [] };
}

/** The row a disc dropped in `column` would land on, or -1 if the column is full. */
export function dropRow(board: string, column: number): number {
  for (let r = 0; r < ROWS; r++) if (board[cellIndex(r, column)] === '.') return r;
  return -1;
}

/** Discs currently in a column. */
export function columnHeight(board: string, column: number): number {
  const row = dropRow(board, column);
  return row === -1 ? ROWS : row;
}

const DIRECTIONS: [number, number][] = [
  [0, 1], // across
  [1, 0], // up
  [1, 1], // diagonal up-right
  [1, -1], // diagonal up-left
];

/** The first line of four found, if any. */
function findWin(board: string): { winner: Disc; line: number[] } | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const disc = board[cellIndex(r, c)];
      if (disc === '.') continue;
      for (const [dr, dc] of DIRECTIONS) {
        const line = [cellIndex(r, c)];
        for (let k = 1; k < 4; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || board[cellIndex(rr, cc)] !== disc) break;
          line.push(cellIndex(rr, cc));
        }
        if (line.length === 4) return { winner: disc as Disc, line };
      }
    }
  }
  return null;
}

export function getStatus(state: ConnectFourState): GameStatus {
  const win = findWin(state.board);
  if (win) return { kind: 'win', winner: win.winner, line: win.line };
  if (!state.board.includes('.')) return { kind: 'draw' };
  return { kind: 'playing' };
}

/** Columns that still have room. Empty once the game is over. */
export function legalMoves(state: ConnectFourState): ConnectFourMove[] {
  if (getStatus(state).kind !== 'playing') return [];
  const moves: ConnectFourMove[] = [];
  for (let column = 0; column < COLS; column++) {
    if (dropRow(state.board, column) !== -1) moves.push({ column });
  }
  return moves;
}

export function validateMove(state: ConnectFourState, move: ConnectFourMove): MoveResult {
  if (getStatus(state).kind !== 'playing') return { ok: false, reason: 'The game is over' };
  if (!Number.isInteger(move.column) || move.column < 0 || move.column >= COLS) {
    return { ok: false, reason: 'Pick a column from 1 to 7' };
  }
  if (dropRow(state.board, move.column) === -1) return { ok: false, reason: 'That column is full' };
  return { ok: true };
}

/** Pure: returns a new state. Throws on an illegal move. */
export function applyMove(state: ConnectFourState, move: ConnectFourMove): ConnectFourState {
  const check = validateMove(state, move);
  if (!check.ok) throw new Error(check.reason);
  const row = dropRow(state.board, move.column);
  const at = cellIndex(row, move.column);
  const board = state.board.slice(0, at) + state.turn + state.board.slice(at + 1);
  return { board, turn: other(state.turn), moves: [...state.moves, move.column] };
}

/** Index of the disc dropped by the most recent move, or null. */
export function lastDiscIndex(state: ConnectFourState): number | null {
  if (state.moves.length === 0) return null;
  const column = state.moves[state.moves.length - 1];
  return cellIndex(columnHeight(state.board, column) - 1, column);
}