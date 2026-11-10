'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UI } from './assets';

type Mode = 'login' | 'register';

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Try again.');
  return data;
}

export default function LoginForm({ devLogin, notice = '' }: { devLogin: boolean; notice?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState(notice);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      router.replace('/');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    run(() => post(mode === 'login' ? '/api/auth/login' : '/api/auth/register', f));
  };

  return (
    <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h1 className="title" style={{ fontSize: 'clamp(40px, 12vw, 56px)' }}>SPACEMINER</h1>
        <p className="muted" style={{ margin: 0, textShadow: '2px 2px 0 #07050d' }}>Mine drifting asteroids. Build factories. Haul it all to market.</p>
      </div>

      <section className="panel" style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div role="tablist" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              className={mode === m ? 'btn' : 'btn-alt'}
              style={{ fontSize: 16 }}
              onClick={() => { setMode(m); setError(''); }}
            >
              {m === 'login' ? 'LOG IN' : 'NEW PILOT'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'register' && (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="tiny">PILOT NAME</span>
              <input className="field" name="name" required minLength={3} maxLength={24} placeholder="Captain Rocko" autoComplete="nickname" />
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="tiny">EMAIL</span>
            <input className="field" name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="tiny">PASSWORD</span>
            <input className="field" name="password" type="password" required minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
          {error && (
            <p role="alert" style={{ margin: 0, color: 'var(--orange)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <img src={UI.iconWarn} alt="" width={24} height={24} />
              {error}
            </p>
          )}
          <button className="btn" type="submit" disabled={busy}>
            {mode === 'login' ? 'LAUNCH' : 'CREATE PILOT'}
          </button>
          {mode === 'register' && (
            <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.4 }}>
              By creating a pilot you accept the <Link href="/terms" style={{ color: 'var(--yellow)' }}>Terms</Link>. Your email is only used to log you in. Your pilot name is visible to other players. See the{' '}
              <Link href="/privacy" style={{ color: 'var(--yellow)' }}>Privacy policy</Link>.
            </p>
          )}
        </form>
      </section>

      {devLogin && (
        <section className="panel" style={{ padding: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="tiny" style={{ color: 'var(--yellow)' }}>TEST MODE</div>
            <div className="muted" style={{ fontSize: 14 }}>Make a throwaway pilot in one click.</div>
          </div>
          <button className="btn-alt" style={{ fontSize: 16 }} disabled={busy} onClick={() => run(() => post('/api/auth/dev'))}>
            TEST PILOT
          </button>
        </section>
      )}

      <footer className="tiny legal-links" style={{ textShadow: '2px 2px 0 #07050d' }}>
        <Link href="/privacy">PRIVACY</Link>
        <span className="muted">·</span>
        <Link href="/terms">TERMS</Link>
      </footer>
    </div>
  );
}
