// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import OnlineGame from '../src/components/online/OnlineGame';
import OnlineLobby from '../src/components/online/OnlineLobby';
import { POST as createRoute } from '../src/app/api/rooms/route';
import { GET as getRoom, POST as roomAction } from '../src/app/api/rooms/[id]/route';
import { MemoryRoomStore, setStore } from '../src/lib/roomStore';

const ORIGIN = 'http://localhost';

/** Route the components' fetch() calls to the real API handlers. */
function installFetch() {
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input, ORIGIN);
    const req = new Request(url, init);
    const match = url.pathname.match(/^\/api\/rooms(?:\/([a-z0-9]+))?$/);
    if (!match) return new Response('not found', { status: 404 });
    const id = match[1];
    if (!id) return createRoute(req);
    const ctx = { params: Promise.resolve({ id }) };
    return req.method === 'GET' ? getRoom(req, ctx) : roomAction(req, ctx);
  });
}

async function api(path: string, body: object) {
  const res = await fetch(`/api/rooms${path}`, { method: 'POST', body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

async function newGame(game: string, side: string, timeControlId = 'untimed') {
  const { body } = await api('', { game, side, timeControlId });
  return { id: body.id as string, token: body.token as string, side: body.side as string };
}

async function join(id: string) {
  const { body } = await api(`/${id}`, { action: 'join' });
  return { token: body.token as string, side: body.side as string };
}

const play = (id: string, token: string, move: object) => api(`/${id}`, { action: 'move', token, move });

const seatIn = (id: string, token: string, side: string) =>
  localStorage.setItem(`seat:${id}`, JSON.stringify({ token, side }));

const square = (name: string) => screen.getByRole('gridcell', { name: new RegExp(`^${name},`) });
const click = (name: string) => fireEvent.click(square(name));
const column = (n: number) => screen.getByRole('button', { name: new RegExp(`^Column ${n},`) }) as HTMLButtonElement;

beforeEach(() => {
  setStore(new MemoryRoomStore());
  installFetch();
  localStorage.clear();
  push.mockClear();
});

afterEach(() => {
  cleanup();
  setStore(undefined);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('online chess', () => {
  it('shows an invite link while waiting for an opponent', async () => {
    const game = await newGame('chess', 'w');
    seatIn(game.id, game.token, game.side);
    render(<OnlineGame game="chess" roomId={game.id} />);

    expect(await screen.findByText('Send this link to your opponent')).toBeTruthy();
    expect(screen.getByText('waiting…')).toBeTruthy();
    fireEvent.click(square('e2'));
    expect(square('e2').getAttribute('aria-selected')).toBe('false'); // moves not accepted yet
  });

  it('lets a visitor join, then plays moves both ways', async () => {
    const game = await newGame('chess', 'w');
    render(<OnlineGame game="chess" roomId={game.id} />); // the visitor opens the link with no seat

    fireEvent.click(await screen.findByRole('button', { name: 'Join game' }));
    await screen.findByText(/Opponent's move/);
    expect(JSON.parse(localStorage.getItem(`seat:${game.id}`)!).side).toBe('b');

    expect((await play(game.id, game.token, { from: 'e2', to: 'e4' })).status).toBe(200);
    await screen.findByText('Your move', undefined, { timeout: 4000 });
    expect(screen.getByText('e4')).toBeTruthy();

    // Black sits at the bottom, so the board is flipped. Play e7-e5 by clicking.
    click('e7');
    expect(square('e7').getAttribute('aria-selected')).toBe('true');
    click('e5');
    await screen.findByText(/Opponent's move/);
    expect(screen.getByText('e5')).toBeTruthy();
    expect(square('e5').getAttribute('aria-label')).toMatch(/black pawn/);
  });

  it('plays a move by clicking and lists it', async () => {
    const game = await newGame('chess', 'w');
    seatIn(game.id, game.token, 'w');
    await join(game.id);
    render(<OnlineGame game="chess" roomId={game.id} />);
    await screen.findByText('Your move');

    click('g1');
    click('f3');
    await screen.findByText(/Opponent's move/);
    expect(screen.getByText('Nf3')).toBeTruthy();
  });

  it('shows the result after resigning', async () => {
    const game = await newGame('chess', 'w');
    seatIn(game.id, game.token, 'w');
    await join(game.id);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<OnlineGame game="chess" roomId={game.id} />);
    await screen.findByText('Your move');
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));

    expect(await screen.findByText('You lost: Black wins: White resigned')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Resign' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lets spectators watch a full game without controls', async () => {
    const game = await newGame('chess', 'w');
    await join(game.id);
    render(<OnlineGame game="chess" roomId={game.id} />);

    expect(await screen.findByText('This game is full. You are watching.')).toBeTruthy();
    fireEvent.click(square('e2'));
    expect(square('e2').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByRole('button', { name: 'Resign' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows clocks for timed games and a flip button', async () => {
    const game = await newGame('chess', 'w', '5+0');
    seatIn(game.id, game.token, 'w');
    render(<OnlineGame game="chess" roomId={game.id} />);
    expect((await screen.findAllByLabelText(/time$/)).length).toBe(2);
    expect(screen.getAllByText('5:00').length).toBe(2);
    expect(screen.getByRole('button', { name: 'Flip board' })).toBeTruthy();
  });

  it('says so when the game does not exist', async () => {
    render(<OnlineGame game="chess" roomId="zzzzzzzz" />);
    expect(await screen.findByText('Game not found')).toBeTruthy();
  });
});

describe('online checkers', () => {
  it('plays a move and shows the mandatory-capture note', async () => {
    const game = await newGame('checkers', 'b');
    seatIn(game.id, game.token, 'b');
    const opponent = await join(game.id);
    render(<OnlineGame game="checkers" roomId={game.id} />);
    await screen.findByText('Your move');

    click('c3');
    click('d4');
    await screen.findByText(/Opponent's move/);
    expect(screen.getByText('c3-d4')).toBeTruthy();

    expect((await play(game.id, opponent.token, { path: ['b6', 'a5'] })).status).toBe(200);
    await screen.findByText('Your move', undefined, { timeout: 4000 });
    click('d4');
    click('c5');

    // White must now capture, which is shown to both players.
    await screen.findByText("Opponent's move (capture is mandatory)");
  });

  it('walks through a multi-jump square by square as the second player', async () => {
    const game = await newGame('checkers', 'b');
    const white = await join(game.id);
    // Opening that leaves White with the double jump h6 > f4 > h2.
    const line: [string, string[]][] = [
      [game.token, ['g3', 'f4']],
      [white.token, ['d6', 'c5']],
      [game.token, ['h2', 'g3']],
      [white.token, ['e7', 'd6']],
      [game.token, ['f4', 'g5']],
    ];
    for (const [token, path] of line) expect((await play(game.id, token, { path })).status).toBe(200);

    seatIn(game.id, white.token, 'w');
    render(<OnlineGame game="checkers" roomId={game.id} />);
    await screen.findByText('Your move (capture is mandatory)');

    click('h6');
    expect(square('h6').getAttribute('aria-selected')).toBe('true');
    click('f4'); // first jump, over g5: not sent yet
    expect(screen.queryByText('h6xf4')).toBeNull();
    click('h2'); // second jump, over g3: the whole move is sent

    await screen.findByText(/Opponent's move/);
    expect(screen.getByText('h6xf4xh2')).toBeTruthy();
    expect(square('h2').getAttribute('aria-label')).toBe('h2, white man');
    expect(square('g5').getAttribute('aria-label')).toBe('g5, empty');
  });

  it('refuses to select pieces when it is not your turn', async () => {
    const game = await newGame('checkers', 'b');
    const white = await join(game.id);
    seatIn(game.id, white.token, 'w');
    render(<OnlineGame game="checkers" roomId={game.id} />);
    await screen.findByText(/Opponent's move/);
    click('b6');
    expect(square('b6').getAttribute('aria-selected')).toBe('false');
  });
});

describe('online Connect Four', () => {
  it('finishes a game with a winning drop', async () => {
    const game = await newGame('connect4', 'r');
    const yellow = await join(game.id);
    for (const [token, c] of [
      [game.token, 0],
      [yellow.token, 1],
      [game.token, 0],
      [yellow.token, 1],
      [game.token, 0],
      [yellow.token, 1],
    ] as const) {
      expect((await play(game.id, token, { column: c })).status).toBe(200);
    }

    seatIn(game.id, game.token, 'r');
    render(<OnlineGame game="connect4" roomId={game.id} />);
    await screen.findByText('Your move');
    fireEvent.click(column(1));

    expect(await screen.findByText('You won: Red wins with four in a row')).toBeTruthy();
    expect(document.querySelectorAll('[data-win="true"]')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: 'Flip board' })).toBeNull();
  });

  it('locks the columns until it is your turn, then accepts the number keys', async () => {
    const game = await newGame('connect4', 'r');
    const yellow = await join(game.id);
    seatIn(game.id, yellow.token, 'y');
    render(<OnlineGame game="connect4" roomId={game.id} />);

    await screen.findByText(/Opponent's move/);
    for (let n = 1; n <= 7; n++) expect(column(n).disabled).toBe(true);

    expect((await play(game.id, game.token, { column: 3 })).status).toBe(200);
    await screen.findByText('Your move', undefined, { timeout: 4000 });
    expect(column(1).disabled).toBe(false);

    fireEvent.keyDown(window, { key: '5' });
    await screen.findByText(/Opponent's move/);
    expect(column(5).getAttribute('aria-label')).toBe('Column 5, 5 free');
    expect(screen.getByText('4')).toBeTruthy(); // red's move is listed (column 4)
  });
});

describe('lobby', () => {
  it('lists the sides in moving order for each game', async () => {
    const { unmount } = render(<OnlineLobby game="chess" />);
    expect(screen.getByRole('heading', { name: 'Chess online' })).toBeTruthy();
    expect([...document.querySelectorAll('[aria-pressed]')].map((b) => b.textContent)).toEqual(['White', 'Random', 'Black']);
    unmount();

    render(<OnlineLobby game="checkers" />);
    expect([...document.querySelectorAll('[aria-pressed]')].map((b) => b.textContent)).toEqual(['Black', 'Random', 'White']);
  });

  it('creates a game, remembers the seat and opens the room', async () => {
    render(<OnlineLobby game="connect4" />);
    fireEvent.click(screen.getByRole('button', { name: 'Yellow' }));
    fireEvent.change(screen.getByLabelText('Time control'), { target: { value: '3+2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create game and get invite link' }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const url = push.mock.calls[0][0] as string;
    const id = url.split('/').pop()!;
    expect(url).toBe(`/connect4/online/${id}`);
    expect(JSON.parse(localStorage.getItem(`seat:${id}`)!).side).toBe('y');

    const res = await fetch(`/api/rooms/${id}`);
    const room = await res.json();
    expect(room.game).toBe('connect4');
    expect(room.timeControlId).toBe('3+2');
  });

  it('joins from a pasted link or a bare code', async () => {
    render(<OnlineLobby game="checkers" />);
    const input = screen.getByLabelText('Game code or link');
    fireEvent.change(input, { target: { value: 'http://localhost/checkers/online/ABCD1234/' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(push).toHaveBeenCalledWith('/checkers/online/abcd1234');

    fireEvent.change(input, { target: { value: 'k7m2x9pq' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(push).toHaveBeenLastCalledWith('/checkers/online/k7m2x9pq');
  });

  it('handles an unknown game', () => {
    render(<OnlineLobby game="go" />);
    expect(screen.getByText('Unknown game')).toBeTruthy();
  });
});
