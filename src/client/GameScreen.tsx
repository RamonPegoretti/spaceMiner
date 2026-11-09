'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CLAIM_COST, MAX_CLAIMS } from '@/game/claims';
import { galaxy } from '@/game/galaxy';
import { ORE_INFO, ORES, type Ore } from '@/game/resources';
import type { PublicPilot } from '@/server/http';
import type { WorldView } from '@/server/world';
import { UI } from './assets';
import type { MapView } from './MapCanvas';
import { fmtDuration, fmtTonnes, oreNow, remainingNow, serverNow, toClientWorld, type ClientWorld } from './world';

const MapCanvas = dynamic(() => import('./MapCanvas'), { ssr: false });
const FactoryScreen = dynamic(() => import('./FactoryScreen'), { ssr: false });

const ORE_ICON: Record<Ore, string> = { iron: UI.oreIron, nickel: UI.oreNickel, ice: UI.oreIce, silicate: UI.oreSil };
const POLL_MS = 5_000;

type Screen = 'map' | 'factory';
const NAV: { label: string; icon: string; screen?: Screen }[] = [
  { label: 'Map', icon: UI.iconMap, screen: 'map' },
  { label: 'Factory', icon: UI.iconFactory, screen: 'factory' },
  { label: 'Market', icon: UI.iconMarket },
  { label: 'Fleet', icon: UI.iconFleet },
];

async function api(url: string, body?: unknown): Promise<{ pilot: PublicPilot; world: WorldView }> {
  const res = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw Object.assign(new Error('logged out'), { loggedOut: true });
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Try again.');
  return data;
}

/** Re-renders every `ms` so live counters keep moving between polls. */
function useClock(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export default function GameScreen({ pilot: initialPilot, saved }: { pilot: PublicPilot; saved: boolean }) {
  const router = useRouter();
  const [pilot, setPilot] = useState(initialPilot);
  const worldRef = useRef<ClientWorld | null>(null);
  const [world, setWorld] = useState<ClientWorld | null>(null);
  const [view, setView] = useState<MapView>({ mode: 'galaxy' });
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState<Screen>('map');
  const [account, setAccount] = useState(false);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const check = () => setPhone(window.innerWidth <= 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const apply = useCallback((d: { pilot: PublicPilot; world: WorldView }) => {
    const w = toClientWorld(d.world);
    worldRef.current = w;
    setWorld(w);
    setPilot(d.pilot);
  }, []);

  const loggedOut = useCallback(() => {
    router.replace('/login?lost=1');
    router.refresh();
  }, [router]);

  useEffect(() => {
    let stop = false;
    const poll = () =>
      api('/api/world')
        .then((d) => !stop && apply(d))
        .catch((e) => e.loggedOut && loggedOut());
    poll();
    const id = setInterval(() => document.visibilityState === 'visible' && poll(), POLL_MS);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [apply, loggedOut]);

  const act = async (url: string, body: unknown) => {
    setBusy(true);
    setError('');
    try {
      apply(await api(url, body));
    } catch (e) {
      if ((e as { loggedOut?: boolean }).loggedOut) return loggedOut();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    router.replace('/login');
    router.refresh();
  };

  const enterSystem = useCallback((id: string) => {
    setView({ mode: 'system', id });
    setSelected(null);
    setError('');
  }, []);
  const pickField = useCallback((slot: string | null) => {
    setSelected(slot);
    setError('');
  }, []);

  const system = view.mode === 'system' ? galaxy().byId.get(view.id) : undefined;
  const field = selected && world ? world.fields.get(selected) : undefined;

  return (
    <main style={{ position: 'fixed', inset: 0 }}>
      {screen === 'map' ? (
        <MapCanvas view={view} world={worldRef} selected={selected} onPickSystem={enterSystem} onPickField={pickField} />
      ) : (
        <FactoryScreen onPilot={setPilot} phone={phone} />
      )}

      <header className="hud-top">
        <h1 className="title hud-logo">SPACEMINER</h1>
        <div className="panel hud-system" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px 0 4px' }}>
          {screen === 'factory' ? (
            <>
              <span className="tiny muted">FACTORY</span>
              <span style={{ fontWeight: 600, paddingRight: 4 }}>Home Foundry</span>
            </>
          ) : system ? (
            <>
              <button className="btn-alt" style={{ fontSize: 14, minHeight: 36 }} onClick={() => (setView({ mode: 'galaxy' }), setSelected(null))}>
                ◀ GALAXY
              </button>
              <span style={{ fontWeight: 600, paddingRight: 4 }}>{system.name}</span>
            </>
          ) : (
            <>
              <span className="tiny muted">GALAXY</span>
              <span style={{ fontWeight: 600, paddingRight: 4 }}>Alpha Sector</span>
            </>
          )}
        </div>
        <div className="hud-right">
          <div className="panel" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
            <img src={UI.coin} alt="Credits" width={30} height={30} />
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--yellow)' }}>{pilot.credits.toLocaleString('en-US')}</span>
          </div>
          <div className="panel hud-pilot" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px 0 4px' }}>
            <button
              onClick={() => setAccount((a) => !a)}
              aria-expanded={account}
              title="Account"
              style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, minWidth: 0, flex: 1, background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer' }}
            >
              <span className="tiny muted">{pilot.isTest ? 'TEST PILOT' : 'PILOT'} ▾</span>
              <span className="hud-pilot-name">{pilot.name}</span>
            </button>
            <button className="btn-alt" style={{ fontSize: 14, minHeight: 36 }} onClick={logout}>EXIT</button>
          </div>
        </div>
      </header>

      {screen === 'map' && system && (
        <div className="hud-back-phone">
          <button className="btn-alt" style={{ fontSize: 14, minHeight: 36 }} onClick={() => (setView({ mode: 'galaxy' }), setSelected(null))}>
            ◀ GALAXY
          </button>
          <span className="tiny" style={{ color: 'var(--yellow)', textShadow: '2px 2px 0 var(--ink)' }}>{system.name.toUpperCase()}</span>
        </div>
      )}

      <OreBar world={world} />

      <nav aria-label="Main" className="panel hud-nav">
        {NAV.map((n) => (
          <button
            key={n.label}
            className={n.screen === screen ? 'btn' : 'hud-nav-item'}
            aria-label={n.screen ? n.label : `${n.label} (coming soon)`}
            aria-current={n.screen === screen ? 'page' : undefined}
            title={n.screen ? n.label : `${n.label}: coming soon`}
            disabled={!n.screen}
            onClick={() => n.screen && (setScreen(n.screen), setSelected(null))}
            style={n.screen === screen ? { minHeight: 0, padding: 0 } : { cursor: n.screen ? 'pointer' : undefined }}
          >
            <img src={n.icon} alt="" width={36} height={36} />
          </button>
        ))}
      </nav>

      {account && <AccountPanel pilot={pilot} onLogout={logout} onClose={() => setAccount(false)} />}

      {screen === 'map' && field && world && system && (
        <FieldPanel
          world={world}
          field={field}
          busy={busy}
          error={error}
          canAfford={pilot.credits >= CLAIM_COST}
          atLimit={world.claims >= MAX_CLAIMS}
          onClaim={() => act('/api/claims', { slot: field.slot })}
          onAbandon={() => field.claim && act('/api/claims/abandon', { id: field.claim.id })}
          onClose={() => setSelected(null)}
        />
      )}

      <footer className="hud-bottom" style={screen === 'factory' ? { display: 'none' } : undefined}>
        <div className="panel hud-hint" style={{ padding: '0 4px', display: screen === 'map' ? undefined : 'none' }}>
          <span className="tiny muted">
            {system ? 'TAP A FIELD TO CLAIM IT · TAP A GATE TO JUMP' : 'TAP A STAR SYSTEM TO ENTER'} · DRAG TO MOVE · SCROLL OR PINCH TO ZOOM
          </span>
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

/** Your account: download your data, delete your pilot, log out everywhere, legal pages. */
function AccountPanel({ pilot, onLogout, onClose }: { pilot: PublicPilot; onLogout: () => void; onClose: () => void }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/account/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }) }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      router.replace('/login');
      router.refresh();
      return;
    }
    setError(data.error ?? 'Something went wrong. Try again.');
    setBusy(false);
  };

  return (
    <section className="panel account-panel" aria-label="Account">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tiny muted">{pilot.isTest ? 'TEST PILOT' : 'PILOT'} · ACCOUNT</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--yellow)', overflowWrap: 'anywhere' }}>{pilot.name}</div>
        </div>
        <button className="btn-alt" aria-label="Close" style={{ fontSize: 14, minHeight: 36, padding: '0 4px' }} onClick={onClose}>✕</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        <a className="btn-alt" style={{ fontSize: 15, textDecoration: 'none' }} href="/api/account/export" download>DOWNLOAD MY DATA</a>
        <button className="btn-alt" style={{ fontSize: 15 }} onClick={onLogout}>LOG OUT ON ALL DEVICES</button>
        {!confirm ? (
          <button className="btn-alt" style={{ fontSize: 15, color: 'var(--orange)' }} onClick={() => setConfirm(true)}>DELETE PILOT</button>
        ) : (
          <form onSubmit={remove} className="panel-warn" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.35 }}>
              This permanently deletes your pilot, credits, claims and factory. This cannot be undone.
            </p>
            {!pilot.isTest && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span className="tiny">PASSWORD</span>
                <input className="field" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            )}
            {error && <p role="alert" style={{ margin: 0, color: 'var(--orange)', fontSize: 14 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn-alt" style={{ flex: 1, fontSize: 14 }} disabled={busy} onClick={() => (setConfirm(false), setError(''))}>KEEP</button>
              <button type="submit" className="btn" style={{ flex: 1, fontSize: 14 }} disabled={busy}>DELETE FOREVER</button>
            </div>
          </form>
        )}
      </div>

      <p className="tiny account-links" style={{ margin: '10px 0 0', display: 'flex', gap: 8, justifyContent: 'center' }}>
        <a href="/privacy" target="_blank" rel="noopener">PRIVACY</a>
        <span className="muted">·</span>
        <a href="/terms" target="_blank" rel="noopener">TERMS</a>
      </p>
    </section>
  );
}

function OreBar({ world }: { world: ClientWorld | null }) {
  useClock(1000);
  return (
    <div className="panel hud-ore" aria-label="Your ore">
      {ORES.map((o) => {
        const rate = world?.ore[o]?.rate ?? 0;
        return (
          <div key={o} className="hud-ore-item" title={ORE_INFO[o].name}>
            <img src={ORE_ICON[o]} alt={ORE_INFO[o].name} width={22} height={22} />
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
              <span style={{ fontWeight: 700 }}>{world ? fmtTonnes(oreNow(world, o)) : '–'}</span>
              <span className="tiny" style={{ color: rate ? 'var(--green)' : 'var(--muted)', fontSize: 9 }}>{rate ? `+${rate}/MIN` : 'T'}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FieldPanel(p: {
  world: ClientWorld;
  field: WorldView['fields'][number];
  busy: boolean;
  error: string;
  canAfford: boolean;
  atLimit: boolean;
  onClaim: () => void;
  onAbandon: () => void;
  onClose: () => void;
}) {
  useClock(1000);
  const { field: f, world: w } = p;
  const left = remainingNow(w, f);
  const share = left / f.initial;
  const now = serverNow(w);
  const dry = left <= 0;

  return (
    <section className="panel field-panel" aria-label={`${f.name} details`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src={ORE_ICON[f.ore]} alt="" width={33} height={33} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tiny muted">ASTEROID FIELD · {ORE_INFO[f.ore].name.toUpperCase()}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--yellow)' }}>{f.name}</div>
        </div>
        <button className="btn-alt" aria-label="Close" style={{ fontSize: 14, minHeight: 36, padding: '0 4px' }} onClick={p.onClose}>✕</button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="tiny muted">ORE LEFT</span>
          <span className="tiny">{fmtTonnes(left)} / {fmtTonnes(f.initial)} T</span>
        </div>
        <div className="meter" aria-hidden>
          <div style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: share < 0.3 ? 'var(--orange)' : 'var(--yellow)' }} />
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 15, lineHeight: 1.35 }}>
        {dry ? (
          <p style={{ margin: 0 }}>
            This field is dry.{' '}
            {f.respawnAt ? `New rocks drift in within ${fmtDuration(f.respawnAt - now)}.` : 'New rocks drift in soon.'}
          </p>
        ) : f.claim?.mine ? (
          <p style={{ margin: 0 }}>
            <b style={{ color: 'var(--green)' }}>Your rig is mining {f.rate} t/min.</b> Runs dry in {fmtDuration((left / f.rate) * 60_000)}.
          </p>
        ) : f.claim ? (
          <p style={{ margin: 0 }}>
            Claimed by <b style={{ color: '#ff6a5a' }}>{f.claim.pilotName}</b>, mining {f.rate} t/min. Dry in {fmtDuration((left / f.rate) * 60_000)}.
          </p>
        ) : (
          <p style={{ margin: 0 }}>Free to claim. Your rig mines 25 t/min until the field runs dry.</p>
        )}
      </div>

      {p.error && (
        <p role="alert" style={{ margin: '8px 0 0', color: 'var(--orange)', fontSize: 14 }}>
          {p.error}
        </p>
      )}

      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        {f.claim?.mine ? (
          <button className="btn-alt" style={{ flex: 1 }} disabled={p.busy} onClick={p.onAbandon}>
            ABANDON CLAIM
          </button>
        ) : !f.claim && !dry ? (
          <button className="btn" style={{ flex: 1 }} disabled={p.busy || !p.canAfford || p.atLimit} onClick={p.onClaim}>
            <img src={UI.coin} alt="" width={22} height={22} /> CLAIM · {CLAIM_COST.toLocaleString('en-US')}
          </button>
        ) : null}
      </div>
      {!f.claim && !dry && (p.atLimit || !p.canAfford) && (
        <p className="tiny muted" style={{ margin: '6px 0 0' }}>
          {p.atLimit ? `YOU ALREADY RUN ${MAX_CLAIMS} CLAIMS` : 'NOT ENOUGH CREDITS'}
        </p>
      )}
    </section>
  );
}
