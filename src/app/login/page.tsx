import { redirect } from 'next/navigation';
import { currentPilot, devLoginEnabled } from '@/server/auth';
import LoginForm from '@/client/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ lost?: string }> }) {
  if (await currentPilot()) redirect('/');
  const lost = (await searchParams).lost === '1';
  return (
    <main
      style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        backgroundImage: 'url(/assets/sprites/space_bg.png)', backgroundSize: 'cover', backgroundPosition: 'center',
        imageRendering: 'pixelated',
      }}
    >
      <LoginForm devLogin={devLoginEnabled()} notice={lost ? 'We could not find your pilot. Log in again or make a new one.' : ''} />
    </main>
  );
}
