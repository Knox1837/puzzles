import PageShell from '@/components/PageShell';
import OnlineLobby from '@/components/online/OnlineLobby';

export const metadata = { title: 'Connect Four online' };

export default function OnlineLobbyPage() {
  return (
    <PageShell>
      <OnlineLobby game="connect4" />
    </PageShell>
  );
}
