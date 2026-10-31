import { hashPassword, startSession } from '@/server/auth';
import { fail, ok, publicPilot, readJson } from '@/server/http';
import { pilots } from '@/server/pilots';

export async function POST(req: Request) {
  const body = await readJson(req);
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const name = String(body.name ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'That email does not look right.');
  if (password.length < 8) return fail(400, 'Use at least 8 characters for your password.');
  if (!/^[\p{L}\p{N} _.-]{3,24}$/u.test(name)) return fail(400, 'Pilot names are 3 to 24 letters, numbers or spaces.');
  if (await pilots().byEmail(email)) return fail(409, 'That email already has a pilot. Log in instead.');
  if (await pilots().nameTaken(name)) return fail(409, 'That pilot name is taken.');
  const pilot = await pilots().create({ name, email, passwordHash: await hashPassword(password) });
  await startSession(pilot.id);
  return ok({ pilot: publicPilot(pilot) });
}
