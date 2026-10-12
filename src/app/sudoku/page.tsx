import PageShell from '@/components/PageShell';
import SudokuGame from '@/components/SudokuGame';

export const metadata = { title: 'Sudoku' };

export default function SudokuPage() {
  return (
    <PageShell>
      <SudokuGame />
    </PageShell>
  );
}