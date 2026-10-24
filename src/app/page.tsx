import Link from 'next/link';
import styles from './home.module.css';

const GAMES = [
  { href: '/sudoku', title: 'Sudoku', text: 'Race the clock on a fresh puzzle. Solo.' },
  { href: '/chess', title: 'Chess', text: 'Two players on one device, with optional clocks.' },
  { href: '/chess/online', title: 'Chess online', text: 'Play a friend remotely with an invite link.' },
  { href: '/checkers', title: 'Checkers', text: 'Classic 8x8 checkers for two players on one device, with optional clocks.' },
  { href: '/connect4', title: 'Connect Four', text: 'Drop discs and line up four. Two players on one device, with optional clocks.' },
];

export default function Home() {
  return (
    <main className="page">
      <div className={styles.home}>
        <h1 className={styles.title}>Puzzle Engine</h1>
        <p className={styles.lede}>Pick a game.</p>
        <div className={styles.cards}>
          {GAMES.map((g) => (
            <Link key={g.href} href={g.href} className={styles.card}>
              <span className={styles.cardTitle}>{g.title}</span>
              <span className={styles.cardText}>{g.text}</span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}