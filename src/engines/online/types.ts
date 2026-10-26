/** Error with an HTTP status, so API routes can map it straight to a response. */
export class RoomError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'RoomError';
    this.status = status;
  }
}

/** How a finished game ended. `winner` is a side id, or null for a draw. */
export interface RoomResult {
  winner: string | null;
  /** Game-specific ("checkmate", "stalemate"...) or the shared "resignation" / "timeout". */
  reason: string;
}

export interface MoveCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Everything the online layer needs to know about a two-player, turn-based game.
 * Add a game by writing one of these and registering it in games.ts.
 */
export interface OnlineGameDef<State = any, Move = any> {
  /** Also used in URLs and API calls, e.g. "chess" -> /chess/online. */
  id: string;
  title: string;
  /** Side ids in order of moving: the first entry moves first. */
  sides: readonly [string, string];
  sideNames: Record<string, string>;
  /** False when mirroring the board makes no sense (Connect Four). */
  flippable: boolean;

  createState(): State;
  turn(state: State): string;
  /** Turn untrusted network input into a well-formed move, or throw RoomError(400). */
  parseMove(raw: unknown): Move;
  validateMove(state: State, move: Move): MoveCheck;
  /** Pure: returns a new state. */
  applyMove(state: State, move: Move): State;
  /** null while the game is still going. */
  outcome(state: State): RoomResult | null;
  /** One notation string per ply, oldest first. */
  notation(state: State): string[];
  /** Short note about the position for the banner (e.g. "check"), or null. */
  note(state: State): string | null;
  /** Text for game-specific reasons. Resignation and timeout are handled for you. */
  describeResult(result: RoomResult): string;
}
