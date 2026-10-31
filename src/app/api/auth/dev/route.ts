import { devLoginEnabled, startSession } from '@/server/auth';
import { fail, ok, publicPilot } from '@/server/http';
import { randomPilotName } from '@/server/names';
import { pilots } from '@/server/pilots';

/** Creates a throwaway test pilot and logs in as it. */
export async function POST() {
  if (!devLoginEnabled()) return fail(404, 'Not found');
  let name = randomPilotName();
  for (let i = 0; i < 5 && (await pilots().nameTaken(name)); i++) name = randomPilotName();
  const pilot = await pilots().create({ name, isTest: true });
  await startSession(pilot.id);
  return ok({ pilot: publicPilot(pilot) });
}
