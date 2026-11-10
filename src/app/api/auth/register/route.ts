import { hashPassword, startSession } from '@/server/auth';
import { fail, guardPost, ok, publicPilot, readJson } from '@/server/http';
import { pilots } from '@/server/pilots';
import { clientIp, RULES, take } from '@/server/ratelimit';

export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;

export async function POST(req: Request) {
  const bad = guardPost(req);
  if (bad) return bad;
  const body = await readJson(req);
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'That email does not look right.');
  if (password.length < MIN_PASSWORD) return fail(400, `Use at least ${MIN_PASSWORD} characters for your password.`);
  if (password.length > MAX_PASSWORD) return fail(400, `Use at most ${MAX_PASSWORD} characters for your password.`);
  if (!/^[\p{L}\p{N} _.-]{3,24}$/u.test(name)) return fail(400, 'Pilot names are 3 to 24 letters, numbers or spaces.');
  if (!(await take(RULES.register, clientIp(req)))) return fail(429, 'Too many new pilots from your network. Try again later.');
  if (await pilots().byEmail(email)) return fail(409, 'That email already has a pilot. Log in instead.');
  if (await pilots().nameTaken(name)) return fail(409, 'That pilot name is taken.');
  const pilot = await pilots().create({ name, email, passwordHash: await hashPassword(password) });
  await startSession(pilot);
  return ok({ pilot: publicPilot(pilot) });
}
