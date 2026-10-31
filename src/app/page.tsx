import { redirect } from 'next/navigation';
import { currentPilot, hasSessionCookie } from '@/server/auth';
import { publicPilot } from '@/server/http';
import { usingDatabase } from '@/server/pilots';
import GameScreen from '@/client/GameScreen';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const pilot = await currentPilot();
  if (!pilot) redirect((await hasSessionCookie()) ? '/login?lost=1' : '/login');
  return <GameScreen pilot={publicPilot(pilot)} saved={usingDatabase()} />;
}
