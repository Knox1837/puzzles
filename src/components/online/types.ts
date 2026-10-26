/**
 * What the online game page gives a game's board. Each game provides one board
 * component that turns clicks into moves; everything else (polling, seats,
 * clocks, invite links, results) is shared.
 */
export interface OnlineBoardProps<State = any, Move = any> {
  state: State;
  /** This browser's side, or null when watching. */
  mySide: string | null;
  /** True only on this player's turn while the game is on and no request is in flight. */
  canMove: boolean;
  /** True once the game is over. */
  disabled: boolean;
  flipped: boolean;
  onMove: (move: Move) => void;
}
