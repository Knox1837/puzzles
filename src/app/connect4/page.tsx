import PageShell from '@/components/PageShell';
import ConnectFourGame from '@/components/connect4/ConnectFourGame';

export const metadata = { title: 'Connect Four' };

export default function ConnectFourPage() {
  return (
    <PageShell>
      <ConnectFourGame />
    </PageShell>
  );
}