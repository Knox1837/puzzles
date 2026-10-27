import PageShell from '@/components/PageShell';
import OnlineGame from '@/components/online/OnlineGame';

export const metadata = { title: 'Connect Four online' };

export default async function OnlineGamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageShell>
      <OnlineGame game="connect4" roomId={id} />
    </PageShell>
  );
}
