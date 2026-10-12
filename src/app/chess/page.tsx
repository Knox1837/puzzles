import PageShell from '@/components/PageShell';
import ChessGame from '@/components/chess/ChessGame';

export const metadata = { title: 'Chess' };

export default function ChessPage() {
  return (
    <PageShell>
      <ChessGame />
    </PageShell>
  );
}