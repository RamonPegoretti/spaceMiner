import 'server-only';
import { cookies } from 'next/headers';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { pilots, type Pilot } from './pilots';
import { makeToken, MAX_AGE, readToken } from './session';

export { devLoginEnabled } from './session';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = 'sm_session';
const HOUR = 60 * 60 * 1000;

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

/** A hash of a random password, checked when a login email is unknown so the reply takes as long either way. */
let dummyHash: Promise<string> | null = null;
export async function checkLogin(pilot: Pilot | null, password: string): Promise<boolean> {
  if (pilot?.passwordHash) return checkPassword(password, pilot.passwordHash);
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await checkPassword(password, await dummyHash);
  return false;
}

export async function startSession(pilot: Pilot) {
  const jar = await cookies();
  jar.set(COOKIE, makeToken(secret(), pilot.id, pilot.sessionVersion), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

/** Logs out: every copy of this pilot's cookie, on every device, stops working. */
export async function endSession() {
  const pilot = await currentPilot();
  if (pilot) await pilots().bumpSessionVersion(pilot.id);
  (await cookies()).delete(COOKIE);
}

/** Just forgets the cookie in this browser (used after the pilot was deleted). */
export async function clearSessionCookie() {
  (await cookies()).delete(COOKIE);
}

export async function currentPilot(): Promise<Pilot | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const token = readToken(secret(), raw);
  if (!token) return null;
  const pilot = await pilots().byId(token.pilotId);
  if (!pilot || pilot.sessionVersion !== token.version) return null;
  // Remember activity (at most once an hour) so idle test pilots can be cleaned up.
  if (Date.now() - Date.parse(pilot.lastSeenAt) > HOUR) await pilots().touch(pilot.id);
  return pilot;
}

/**
 * True when the browser sent a well-formed, correctly signed login cookie whose pilot is gone.
 * Old-format, expired or revoked cookies count as plain logged out.
 */
export async function hasSessionCookie(): Promise<boolean> {
  const raw = (await cookies()).get(COOKIE)?.value;
  const token = raw ? readToken(secret(), raw) : null;
  return Boolean(token && !(await pilots().byId(token.pilotId)));
}
