import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Login cookie tokens: `<pilotId>.<issuedAt>.<sessionVersion>.<sig>`.
 * issuedAt is in seconds, so a token stops working after MAX_AGE on the server too,
 * and bumping a pilot's session version logs out every copy of the cookie at once.
 * Pure functions (no cookies, no storage) so they can be tested with a fake clock.
 */
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days, in seconds

const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('base64url');

export function makeToken(secret: string, pilotId: string, version: number, now = Date.now()): string {
  const body = `${pilotId}.${Math.floor(now / 1000)}.${version}`;
  return `${body}.${hmac(secret, body)}`;
}

/** The pilot id and session version in a token, or null if it is forged, malformed or too old. */
export function readToken(secret: string, raw: string, now = Date.now()): { pilotId: string; version: number } | null {
  const parts = raw.split('.');
  if (parts.length !== 4) return null;
  const [pilotId, issued, version, sig] = parts;
  if (!pilotId || !/^\d{1,12}$/.test(issued) || !/^\d{1,9}$/.test(version)) return null;
  const good = Buffer.from(hmac(secret, `${pilotId}.${issued}.${version}`));
  const got = Buffer.from(sig);
  if (got.length !== good.length || !timingSafeEqual(got, good)) return null;
  const age = Math.floor(now / 1000) - Number(issued);
  if (age > MAX_AGE || age < -300) return null; // too old, or issued in the future
  return { pilotId, version: Number(version) };
}

type Env = Record<string, string | undefined>;

/**
 * The "Test pilot" button. Never on in Vercel production, whatever ENABLE_DEV_LOGIN says,
 * because anyone could use it to make unlimited funded pilots.
 */
export function devLoginEnabled(env: Env = process.env): boolean {
  if (env.VERCEL_ENV === 'production') return false;
  return env.NODE_ENV !== 'production' || env.ENABLE_DEV_LOGIN === 'true';
}
