import PageShell from '@/components/PageShell';
import OnlineChessGame from '@/components/chess/OnlineChessGame';

export const metadata = { title: 'Online chess' };

export default async function OnlineChessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PageShell>
      <OnlineChessGame roomId={id} />
    </PageShell>
  );
}