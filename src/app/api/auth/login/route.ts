import { checkPassword, startSession } from '@/server/auth';
import { fail, ok, publicPilot, readJson } from '@/server/http';
import { pilots } from '@/server/pilots';

export async function POST(req: Request) {
  const body = await readJson(req);
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const pilot = email ? await pilots().byEmail(email) : null;
  if (!pilot?.passwordHash || !(await checkPassword(password, pilot.passwordHash))) {
    return fail(401, 'Wrong email or password.');
  }
  await startSession(pilot.id);
  return ok({ pilot: publicPilot(pilot) });
}
