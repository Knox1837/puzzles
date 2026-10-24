// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ConnectFourGame from '../src/components/connect4/ConnectFourGame';

const column = (n: number) => screen.getByRole('button', { name: new RegExp(`^Column ${n},`) }) as HTMLButtonElement;
const drop = (...cols: number[]) => cols.forEach((n) => fireEvent.click(column(n)));
const discsIn = (n: number) =>
  [...column(n).querySelectorAll<HTMLElement>('[data-disc]')].map((d) => d.dataset.disc);

afterEach(cleanup);

describe('ConnectFourGame', () => {
  it('starts with Red to move and seven open columns', () => {
    render(<ConnectFourGame />);
    expect(screen.getByText('Red to move')).toBeTruthy();
    for (let n = 1; n <= 7; n++) {
      expect(column(n).disabled).toBe(false);
      expect(column(n).getAttribute('aria-label')).toBe(`Column ${n}, 6 free`);
    }
    expect(document.querySelectorAll('[data-disc]')).toHaveLength(0);
  });

  it('drops a disc and passes the turn', () => {
    render(<ConnectFourGame />);
    drop(4);
    expect(discsIn(4)).toEqual(['r']);
    expect(column(4).getAttribute('aria-label')).toBe('Column 4, 5 free');
    expect(screen.getByText('Yellow to move')).toBeTruthy();
  });

  it('stacks discs with alternating colours', () => {
    render(<ConnectFourGame />);
    drop(1, 1, 1);
    // Listed top to bottom: red, yellow, red from the floor up.
    expect(discsIn(1)).toEqual(['r', 'y', 'r']);
  });

  it('disables a full column', () => {
    render(<ConnectFourGame />);
    drop(1, 1, 1, 1, 1, 1);
    expect(column(1).disabled).toBe(true);
    expect(column(1).getAttribute('aria-label')).toBe('Column 1, 0 free');
    expect(screen.getByText('Red to move')).toBeTruthy();
  });

  it('announces a win, highlights four discs and locks the board', () => {
    render(<ConnectFourGame />);
    drop(1, 1, 2, 2, 3, 3, 4);
    expect(screen.getByText('Red wins with four in a row')).toBeTruthy();
    expect(document.querySelectorAll('[data-win="true"]')).toHaveLength(4);
    for (let n = 1; n <= 7; n++) expect(column(n).disabled).toBe(true);
  });

  it('accepts the number keys 1-7', () => {
    render(<ConnectFourGame />);
    fireEvent.keyDown(window, { key: '5' });
    expect(discsIn(5)).toEqual(['r']);
    fireEvent.keyDown(window, { key: '9' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(document.querySelectorAll('[data-disc]')).toHaveLength(1);
  });

  it('does not steal digits typed into the time control', () => {
    render(<ConnectFourGame />);
    fireEvent.keyDown(screen.getByLabelText('Time control'), { key: '3' });
    expect(document.querySelectorAll('[data-disc]')).toHaveLength(0);
  });

  it('shows the result after a resignation', () => {
    render(<ConnectFourGame />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Resign' })[0]); // top panel is Yellow
    expect(screen.getByText('Red wins: Yellow resigned')).toBeTruthy();
    expect(column(3).disabled).toBe(true);
  });

  it('shows clocks once a time control is chosen', () => {
    render(<ConnectFourGame />);
    expect(screen.queryAllByLabelText(/time$/)).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Time control'), { target: { value: '3+2' } });
    expect(screen.getAllByLabelText(/time$/)).toHaveLength(2);
    expect(screen.getAllByText('3:00')).toHaveLength(2);
  });

  it('starts a fresh game', () => {
    render(<ConnectFourGame />);
    drop(1, 2, 3);
    fireEvent.click(screen.getByRole('button', { name: 'New game' }));
    expect(document.querySelectorAll('[data-disc]')).toHaveLength(0);
    expect(screen.getByText('Red to move')).toBeTruthy();
  });
});