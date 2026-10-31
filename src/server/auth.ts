import 'server-only';
import { cookies } from 'next/headers';
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { pilots, type Pilot } from './pilots';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = 'sm_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET is not set');
  return 'dev-only-secret-do-not-use-in-production';
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32);
  return `scrypt:${salt.toString('base64')}:${key.toString('base64')}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, key] = stored.split(':');
  if (algo !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(expected, actual);
}

const sign = (value: string) => createHmac('sha256', secret()).update(value).digest('base64url');

export async function startSession(pilotId: string) {
  const jar = await cookies();
  jar.set(COOKIE, `${pilotId}.${sign(pilotId)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function currentPilot(): Promise<Pilot | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  const id = raw.slice(0, dot);
  const sig = Buffer.from(raw.slice(dot + 1));
  const good = Buffer.from(sign(id));
  if (sig.length !== good.length || !timingSafeEqual(sig, good)) return null;
  return pilots().byId(id);
}

/** True when the browser sent a valid login cookie, even if its pilot no longer exists. */
export async function hasSessionCookie(): Promise<boolean> {
  return Boolean((await cookies()).get(COOKIE)?.value);
}

export const devLoginEnabled = () =>
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_LOGIN === 'true';
