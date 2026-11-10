import { purgeIdleTestPilots } from '@/server/account';
import { devLoginEnabled, startSession } from '@/server/auth';
import { fail, guardPost, ok, publicPilot } from '@/server/http';
import { randomPilotName } from '@/server/names';
import { pilots } from '@/server/pilots';
import { clientIp, RULES, take } from '@/server/ratelimit';

/** Creates a throwaway test pilot and logs in as it. Never available in production. */
export async function POST(req: Request) {
  if (!devLoginEnabled()) return fail(404, 'Not found');
  const bad = guardPost(req);
  if (bad) return bad;
  if (!(await take(RULES.devLogin, clientIp(req)))) return fail(429, 'Too many test pilots from your network. Try again later.');
  // Clean up test pilots nobody has used in a while.
  await purgeIdleTestPilots();
  let name = randomPilotName();
  for (let i = 0; i < 5 && (await pilots().nameTaken(name)); i++) name = randomPilotName();
  const pilot = await pilots().create({ name, isTest: true });
  await startSession(pilot);
  return ok({ pilot: publicPilot(pilot) });
}
