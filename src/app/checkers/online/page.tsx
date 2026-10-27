import PageShell from '@/components/PageShell';
import OnlineLobby from '@/components/online/OnlineLobby';

export const metadata = { title: 'Checkers online' };

export default function OnlineLobbyPage() {
  return (
    <PageShell>
      <OnlineLobby game="checkers" />
    </PageShell>
  );
}
