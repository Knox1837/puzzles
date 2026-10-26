import PageShell from '@/components/PageShell';
import OnlineLobby from '@/components/online/OnlineLobby';

export const metadata = { title: 'Chess online' };

export default function OnlineLobbyPage() {
  return (
    <PageShell>
      <OnlineLobby game="chess" />
    </PageShell>
  );
}
