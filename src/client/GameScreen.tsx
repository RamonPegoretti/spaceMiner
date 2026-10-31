'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { STARTER_SYSTEM } from '@/game/starterSystem';
import type { PublicPilot } from '@/server/http';
import { UI } from './assets';

const GalaxyCanvas = dynamic(() => import('./GalaxyCanvas'), { ssr: false });

const NAV = [
  { label: 'Map', icon: UI.iconMap, ready: true },
  { label: 'Factory', icon: UI.iconFactory, ready: false },
  { label: 'Market', icon: UI.iconMarket, ready: false },
  { label: 'Fleet', icon: UI.iconFleet, ready: false },
];

export default function GameScreen({ pilot, saved }: { pilot: PublicPilot; saved: boolean }) {
  const router = useRouter();
  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  };

  return (
    <main style={{ position: 'fixed', inset: 0 }}>
      <GalaxyCanvas system={STARTER_SYSTEM} />

      <header className="hud-top">
        <h1 className="title hud-logo">SPACEMINER</h1>
        <div className="panel hud-system" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
          <span className="tiny muted">SYSTEM</span>
          <span style={{ fontWeight: 600 }}>{STARTER_SYSTEM.name}</span>
        </div>
        <div className="hud-right">
          <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
            <img src={UI.coin} alt="Credits" width={30} height={30} />
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--yellow)' }}>{pilot.credits.toLocaleString('en-US')}</span>
          </div>
          <div className="panel hud-pilot" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px 0 4px' }}>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, minWidth: 0, flex: 1 }}>
              <span className="tiny muted">{pilot.isTest ? 'TEST PILOT' : 'PILOT'}</span>
              <span className="hud-pilot-name">{pilot.name}</span>
            </span>
            <button className="btn-alt" style={{ fontSize: 14, minHeight: 36 }} onClick={logout}>EXIT</button>
          </div>
        </div>
      </header>

      <nav aria-label="Main" className="panel hud-nav">
        {NAV.map((n) => (
          <button
            key={n.label}
            className={n.ready ? 'btn' : 'hud-nav-item'}
            aria-label={n.ready ? n.label : `${n.label} (coming soon)`}
            title={n.ready ? n.label : `${n.label}: coming soon`}
            disabled={!n.ready}
            style={n.ready ? { minHeight: 0, padding: 0 } : undefined}
          >
            <img src={n.icon} alt="" width={36} height={36} />
          </button>
        ))}
      </nav>

      <footer className="hud-bottom">
        <div className="panel hud-hint" style={{ padding: '0 4px' }}>
          <span className="tiny muted">DRAG TO MOVE · SCROLL OR PINCH TO ZOOM</span>
        </div>
        {!saved && (
          <div className="panel-warn" style={{ padding: '0 4px', display: 'flex', gap: 8, alignItems: 'center' }}>
            <img src={UI.iconWarn} alt="" width={24} height={24} />
            <span style={{ fontSize: 14 }}>No database connected: pilots reset when the server restarts.</span>
          </div>
        )}
      </footer>
    </main>
  );
}
