// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import OnlineChessGame from '../src/components/chess/OnlineChessGame';
import { POST as createRoute } from '../src/app/api/chess/rooms/route';
import { GET as getRoom, POST as roomAction } from '../src/app/api/chess/rooms/[id]/route';
import { MemoryRoomStore, setStore } from '../src/lib/roomStore';

const ORIGIN = 'http://localhost';

/** Route the component's fetch() calls to the real API handlers. */
function installFetch() {
  vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
    const url = new URL(input, ORIGIN);
    const req = new Request(url, init);
    const match = url.pathname.match(/^\/api\/chess\/rooms(?:\/([a-z0-9]+))?$/);
    if (!match) return new Response('not found', { status: 404 });
    const id = match[1];
    if (!id) return createRoute(req);
    const ctx = { params: Promise.resolve({ id }) };
    return req.method === 'GET' ? getRoom(req, ctx) : roomAction(req, ctx);
  });
}

async function api(path: string, body: object) {
  const res = await fetch(`/api/chess/rooms${path}`, { method: 'POST', body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}

async function newGame(opts: { color?: 'w' | 'b'; timeControlId?: string } = {}) {
  const { body } = await api('', { color: opts.color ?? 'w', timeControlId: opts.timeControlId ?? 'untimed' });
  return { id: body.id as string, token: body.token as string, color: body.color as 'w' | 'b' };
}

function seatIn(id: string, token: string, color: 'w' | 'b') {
  localStorage.setItem(`chess-seat:${id}`, JSON.stringify({ token, color }));
}

const square = (name: string) => screen.getByRole('gridcell', { name: new RegExp(`^${name},`) });

beforeEach(() => {
  setStore(new MemoryRoomStore());
  installFetch();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  setStore(undefined);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OnlineChessGame', () => {
  it('shows an invite link while waiting for an opponent', async () => {
    const game = await newGame({ color: 'w' });
    seatIn(game.id, game.token, 'w');
    render(<OnlineChessGame roomId={game.id} />);

    expect(await screen.findByText('Send this link to your opponent')).toBeTruthy();
    expect(screen.getByText('waiting…')).toBeTruthy();
    // Moves are not accepted yet: clicking a pawn selects nothing.
    fireEvent.click(square('e2'));
    expect(square('e2').getAttribute('aria-selected')).toBe('false');
  });

  it('lets a visitor join, then plays moves both ways', async () => {
    const game = await newGame({ color: 'w' });
    // The visitor opens the link with no seat yet.
    render(<OnlineChessGame roomId={game.id} />);

    const joinButton = await screen.findByRole('button', { name: 'Join game' });
    fireEvent.click(joinButton);

    // The visitor became Black; White (the creator) moves via the API.
    await screen.findByText(/Opponent's move/);
    expect(JSON.parse(localStorage.getItem(`chess-seat:${game.id}`)!).color).toBe('b');
    const first = await api(`/${game.id}`, { action: 'move', token: game.token, from: 'e2', to: 'e4' });
    expect(first.status).toBe(200);

    // The next poll shows White's move and hands us the turn.
    await screen.findByText('Your move', undefined, { timeout: 4000 });
    expect(screen.getByText('e4')).toBeTruthy();

    // We play e7-e5 by clicking the board (Black sits at the bottom, so the board is flipped).
    fireEvent.click(square('e7'));
    expect(square('e7').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(square('e5'));

    await screen.findByText(/Opponent's move/);
    expect(screen.getByText('e5')).toBeTruthy();
    expect(square('e5').getAttribute('aria-label')).toMatch(/black pawn/);
  });

  it('plays a move by clicking as the creator and shows it in the move list', async () => {
    const game = await newGame({ color: 'w' });
    seatIn(game.id, game.token, 'w');
    const joined = await api(`/${game.id}`, { action: 'join' });
    expect(joined.status).toBe(200);

    render(<OnlineChessGame roomId={game.id} />);
    await screen.findByText('Your move');

    fireEvent.click(square('g1'));
    fireEvent.click(square('f3'));
    await screen.findByText(/Opponent's move/);
    expect(screen.getByText('Nf3')).toBeTruthy();
  });

  it('shows the result after resigning', async () => {
    const game = await newGame({ color: 'w' });
    seatIn(game.id, game.token, 'w');
    await api(`/${game.id}`, { action: 'join' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<OnlineChessGame roomId={game.id} />);
    await screen.findByText('Your move');
    fireEvent.click(screen.getByRole('button', { name: 'Resign' }));

    expect(await screen.findByText('You lost: Black wins: White resigned')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Resign' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lets spectators watch a full game without controls', async () => {
    const game = await newGame({ color: 'w' });
    await api(`/${game.id}`, { action: 'join' });
    render(<OnlineChessGame roomId={game.id} />);

    expect(await screen.findByText('This game is full. You are watching.')).toBeTruthy();
    fireEvent.click(square('e2'));
    expect(square('e2').getAttribute('aria-selected')).toBe('false');
  });

  it('shows clocks for timed games', async () => {
    const game = await newGame({ color: 'w', timeControlId: '5+0' });
    seatIn(game.id, game.token, 'w');
    render(<OnlineChessGame roomId={game.id} />);
    expect((await screen.findAllByLabelText(/time$/)).length).toBe(2);
    expect(screen.getAllByText('5:00').length).toBe(2);
  });

  it('says so when the game does not exist', async () => {
    render(<OnlineChessGame roomId="zzzzzzzz" />);
    expect(await screen.findByText('Game not found')).toBeTruthy();
  });
});