import PageShell from '@/components/PageShell';
import CheckersGame from '@/components/checkers/CheckersGame';

export const metadata = { title: 'Checkers' };

export default function CheckersPage() {
  return (
    <PageShell>
      <CheckersGame />
    </PageShell>
  );
}