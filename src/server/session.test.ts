import { describe, expect, it } from 'vitest';
import { devLoginEnabled, makeToken, MAX_AGE, readToken } from './session';

const SECRET = 'test-secret';
const ID = '6f1c2a4e-0d7b-4f43-9c1e-2b5a8d9e0f11';
const T0 = Date.UTC(2026, 10, 9);

describe('session tokens', () => {
  it('reads back a fresh token', () => {
    expect(readToken(SECRET, makeToken(SECRET, ID, 3, T0), T0 + 1000)).toEqual({ pilotId: ID, version: 3 });
  });

  it('rejects a tampered signature, id or version', () => {
    const t = makeToken(SECRET, ID, 0, T0);
    const [id, iat, ver, sig] = t.split('.');
    expect(readToken(SECRET, `${id}.${iat}.${ver}.${sig.slice(0, -1)}A`, T0)).toBeNull();
    expect(readToken(SECRET, `${ID.replace('6f', '7f')}.${iat}.${ver}.${sig}`, T0)).toBeNull();
    expect(readToken(SECRET, `${id}.${iat}.1.${sig}`, T0)).toBeNull();
    expect(readToken('other-secret', t, T0)).toBeNull();
  });

  it('expires on the server after 30 days', () => {
    const t = makeToken(SECRET, ID, 0, T0);
    expect(readToken(SECRET, t, T0 + MAX_AGE * 1000)).not.toBeNull();
    expect(readToken(SECRET, t, T0 + (MAX_AGE + 1) * 1000)).toBeNull();
  });

  it('a bumped session version no longer matches', () => {
    const token = readToken(SECRET, makeToken(SECRET, ID, 0, T0), T0)!;
    const pilotNow = { sessionVersion: 1 };
    expect(token.version === pilotNow.sessionVersion).toBe(false);
  });

  it('treats old-format and junk cookies as logged out', () => {
    expect(readToken(SECRET, `${ID}.abcdef`, T0)).toBeNull();
    expect(readToken(SECRET, '', T0)).toBeNull();
    expect(readToken(SECRET, 'a.b.c.d', T0)).toBeNull();
  });
});

describe('dev login', () => {
  it('is never on in Vercel production, even when the flag says so', () => {
    expect(devLoginEnabled({ VERCEL_ENV: 'production', NODE_ENV: 'production', ENABLE_DEV_LOGIN: 'true' })).toBe(false);
  });
  it('follows the flag on previews', () => {
    expect(devLoginEnabled({ VERCEL_ENV: 'preview', NODE_ENV: 'production', ENABLE_DEV_LOGIN: 'true' })).toBe(true);
    expect(devLoginEnabled({ VERCEL_ENV: 'preview', NODE_ENV: 'production', ENABLE_DEV_LOGIN: 'false' })).toBe(false);
  });
  it('is on for local development', () => {
    expect(devLoginEnabled({ NODE_ENV: 'development' })).toBe(true);
  });
});
