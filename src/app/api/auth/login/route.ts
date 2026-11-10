import { checkLogin, startSession } from '@/server/auth';
import { fail, guardPost, ok, publicPilot, readJson } from '@/server/http';
import { pilots } from '@/server/pilots';
import { allowed, clientIp, hit, reset, RULES } from '@/server/ratelimit';

const TOO_MANY = 'Too many attempts. Try again in a few minutes.';

export async function POST(req: Request) {
  const bad = guardPost(req);
  if (bad) return bad;
  const body = await readJson(req);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 320);
  const password = String(body.password ?? '');
  const ip = clientIp(req);
  // Failed guesses are limited per email and per IP address.
  if (!(await allowed(RULES.loginFailIp, ip)) || (email && !(await allowed(RULES.loginFailEmail, email)))) return fail(429, TOO_MANY);

  const pilot = email ? await pilots().byEmail(email) : null;
  // checkLogin hashes even when the email is unknown, so timing does not reveal which emails exist.
  if (password.length > 128 || !(await checkLogin(pilot, password)) || !pilot) {
    await hit(RULES.loginFailIp, ip);
    if (email) await hit(RULES.loginFailEmail, email);
    return fail(401, 'Wrong email or password.');
  }
  await reset(RULES.loginFailEmail, email);
  await startSession(pilot);
  return ok({ pilot: publicPilot(pilot) });
}
