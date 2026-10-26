/** Proof that this browser owns a seat in a game. Kept only in this browser. */
export interface Seat {
  token: string;
  /** Side id, e.g. "w" or "r". */
  side: string;
}

const key = (roomId: string) => `seat:${roomId}`;

export function loadSeat(roomId: string): Seat | null {
  try {
    const raw = localStorage.getItem(key(roomId));
    if (!raw) return null;
    const seat = JSON.parse(raw) as Seat;
    return seat && typeof seat.token === 'string' && typeof seat.side === 'string' ? seat : null;
  } catch {
    return null;
  }
}

export function saveSeat(roomId: string, seat: Seat): void {
  try {
    localStorage.setItem(key(roomId), JSON.stringify(seat));
  } catch {
    // Private mode or storage disabled: the game still works until the tab closes.
  }
}
