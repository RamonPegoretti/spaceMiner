import 'server-only';
import { currentPilot } from './auth';
import { fail, ok, publicPilot } from './http';
import { GameError, worldView } from './world';

/** Runs a game action for the logged-in pilot, then answers with the fresh world state. */
export async function gameAction(action?: (pilotId: string) => Promise<void>) {
  const pilot = await currentPilot();
  if (!pilot) return fail(401, 'Not logged in');
  try {
    if (action) await action(pilot.id);
  } catch (err) {
    if (err instanceof GameError) return fail(409, err.message);
    throw err;
  }
  const fresh = action ? await currentPilot() : pilot;
  return ok({ pilot: publicPilot(fresh ?? pilot), world: await worldView(pilot.id) });
}
