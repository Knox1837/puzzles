import Link from 'next/link';
import styles from './PageShell.module.css';

export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="page">
      <div className={styles.shell}>
        <Link href="/" className={styles.back}>
          ← All games
        </Link>
        {children}
      </div>
    </main>
  );
}