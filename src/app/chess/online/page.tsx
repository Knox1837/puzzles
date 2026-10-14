import PageShell from '@/components/PageShell';
import OnlineLobby from '@/components/chess/OnlineLobby';

export const metadata = { title: 'Chess online' };

export default function OnlineChessLobbyPage() {
  return (
    <PageShell>
      <OnlineLobby />
    </PageShell>
  );
}