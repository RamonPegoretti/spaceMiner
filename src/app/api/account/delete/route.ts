import { deletePilot } from '@/server/account';
import { checkPassword, clearSessionCookie, currentPilot } from '@/server/auth';
import { fail, guardPost, ok, readJson } from '@/server/http';
import { clientIp, hit, allowed, RULES } from '@/server/ratelimit';

/** Permanently deletes the logged-in pilot, their claims and factory: { password }. Test pilots need no password. */
export async function POST(req: Request) {
  const bad = guardPost(req);
  if (bad) return bad;
  const pilot = await currentPilot();
  if (!pilot) return fail(401, 'Not logged in');
  if (pilot.passwordHash) {
    const ip = clientIp(req);
    if (!(await allowed(RULES.loginFailIp, ip))) return fail(429, 'Too many attempts. Try again in a few minutes.');
    const { password } = await readJson(req);
    if (typeof password !== 'string' || password.length > 128 || !(await checkPassword(password, pilot.passwordHash))) {
      await hit(RULES.loginFailIp, ip);
      return fail(401, 'Wrong password.');
    }
  }
  await deletePilot(pilot.id);
  await clearSessionCookie();
  return ok({ ok: true });
}
