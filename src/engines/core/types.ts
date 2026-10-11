export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface GeneratedPuzzle<State> {
  puzzle: State;
  solution: State;
}

export interface MoveResult {
  ok: boolean;
  reason?: string;
}

/**
 * Contract every puzzle type implements. Timers, matchmaking, scoring and
 * leaderboards only ever talk to this interface, so adding a new puzzle means
 * adding one engine (plus a UI board component).
 */
export interface PuzzleEngine<State, Move> {
  readonly id: string;
  /** Deterministic: same (difficulty, seed) always yields the same puzzle. */
  generate(difficulty: Difficulty, seed: string): GeneratedPuzzle<State>;
  /** Structural validation only (bounds, locked cells). Not "is it correct". */
  validateMove(state: State, move: Move): MoveResult;
  /** Pure: returns a new state, never mutates the input. */
  applyMove(state: State, move: Move): State;
  isComplete(state: State): boolean;
  /** 0..1 fraction of the puzzle solved correctly. Safe to show opponents. */
  progress(state: State, solution: State): number;
}
