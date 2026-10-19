// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CheckersGame from '../src/components/checkers/CheckersGame';

const sq = (name: string) => screen.getByRole('gridcell', { name: new RegExp(`^${name},`) });
const click = (name: string) => fireEvent.click(sq(name));
const move = (from: string, to: string) => {
  click(from);
  click(to);
};

afterEach(cleanup);

describe('CheckersGame', () => {
  it('starts with Black to move and 12 pieces each', () => {
    render(<CheckersGame />);
    expect(screen.getByText('Black to move')).toBeTruthy();
    expect(screen.getAllByText('12 pieces')).toHaveLength(2);
    expect(screen.getByText('No moves yet. Black to start.')).toBeTruthy();
  });

  it('plays a move and passes the turn', () => {
    render(<CheckersGame />);
    click('c3');
    expect(sq('c3').getAttribute('aria-selected')).toBe('true');
    click('d4');
    expect(screen.getByText('c3-d4')).toBeTruthy();
    expect(screen.getByText('White to move')).toBeTruthy();
    expect(sq('d4').getAttribute('aria-label')).toBe('d4, black man');
    expect(sq('c3').getAttribute('aria-label')).toBe('c3, empty');
  });

  it('ignores clicks on pieces that cannot move and on the wrong side', () => {
    render(<CheckersGame />);
    click('b6'); // white piece on Black's turn
    expect(sq('b6').getAttribute('aria-selected')).toBe('false');
    click('a1'); // black piece that is blocked in
    expect(sq('a1').getAttribute('aria-selected')).toBe('false');
  });

  it('cancels a selection by clicking the piece again', () => {
    render(<CheckersGame />);
    click('c3');
    expect(sq('c3').getAttribute('aria-selected')).toBe('true');
    click('c3');
    expect(sq('c3').getAttribute('aria-selected')).toBe('false');
  });

  it('lets you switch to another piece before choosing a destination', () => {
    render(<CheckersGame />);
    click('c3');
    click('e3');
    expect(sq('c3').getAttribute('aria-selected')).toBe('false');
    expect(sq('e3').getAttribute('aria-selected')).toBe('true');
  });

  it('enforces a mandatory capture', () => {
    render(<CheckersGame />);
    move('c3', 'd4');
    move('b6', 'a5');
    move('d4', 'c5');
    expect(screen.getByText('White to move: a capture is mandatory')).toBeTruthy();

    // b6 has moved; a5 has no capture, so it cannot be picked. d6 must capture.
    click('a5');
    expect(sq('a5').getAttribute('aria-selected')).toBe('false');
    move('d6', 'b4');
    expect(screen.getByText('d6xb4')).toBeTruthy();
    expect(screen.getAllByText('11 pieces')).toHaveLength(1);
    expect(screen.getAllByText('12 pieces')).toHaveLength(1);
    expect(screen.getByText('Black to move: a capture is mandatory')).toBeTruthy();
  });

  it('walks through a multi-jump square by square', () => {
    render(<CheckersGame />);
    // A short opening that leaves White with the double jump h6 > f4 > h2.
    move('g3', 'f4');
    move('d6', 'c5');
    move('h2', 'g3');
    move('e7', 'd6');
    move('f4', 'g5');
    expect(screen.getByText('White to move: a capture is mandatory')).toBeTruthy();

    click('h6');
    expect(sq('h6').getAttribute('aria-selected')).toBe('true');
    click('f4'); // first jump, over g5
    expect(screen.getByText('White to move: keep jumping')).toBeTruthy();
    expect(screen.queryByText('h6xf4')).toBeNull(); // not committed yet

    click('h2'); // second jump, over g3
    expect(screen.getByText('h6xf4xh2')).toBeTruthy();
    expect(sq('h2').getAttribute('aria-label')).toBe('h2, white man');
    expect(sq('g5').getAttribute('aria-label')).toBe('g5, empty');
    expect(sq('g3').getAttribute('aria-label')).toBe('g3, empty');
    expect(screen.getByText('Black to move')).toBeTruthy();
  });

  it('lets you back out of a half-chosen multi-jump', () => {
    render(<CheckersGame />);
    move('g3', 'f4');
    move('d6', 'c5');
    move('h2', 'g3');
    move('e7', 'd6');
    move('f4', 'g5');
    click('h6');
    click('f4');
    expect(screen.getByText('White to move: keep jumping')).toBeTruthy();
    click('h6'); // cancel
    expect(sq('h6').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByText('White to move: a capture is mandatory')).toBeTruthy();
    expect(screen.queryByText('h6xf4')).toBeNull();
  });

  it('shows the result after a resignation and locks the board', () => {
    render(<CheckersGame />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Resign' })[0]); // top panel is White
    expect(screen.getByText('Black wins: White resigned')).toBeTruthy();
    click('c3');
    expect(sq('c3').getAttribute('aria-selected')).toBe('false');
  });

  it('shows clocks once a time control is chosen', () => {
    render(<CheckersGame />);
    expect(screen.queryAllByLabelText(/time$/)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Time control'), { target: { value: '5+0' } });
    expect(screen.getAllByLabelText(/time$/)).toHaveLength(2);
    expect(screen.getAllByText('5:00')).toHaveLength(2);
  });

  it('flips the board and starts a new game', () => {
    render(<CheckersGame />);
    move('c3', 'd4');
    fireEvent.click(screen.getByRole('button', { name: 'Flip board' }));
    fireEvent.click(screen.getByRole('button', { name: 'New game' }));
    expect(screen.getByText('Black to move')).toBeTruthy();
    expect(screen.getByText('No moves yet. Black to start.')).toBeTruthy();
    expect(sq('c3').getAttribute('aria-label')).toBe('c3, black man');
  });
});