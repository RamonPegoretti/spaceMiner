import type { FactoryOp } from '@/game/factory';
import { currentPilot } from '@/server/auth';
import { editFactory, FactoryError, settledFactory, siloOre } from '@/server/factory';
import { fail, ok, publicPilot, readJson } from '@/server/http';
import { pilotClaims } from '@/server/world';

export const dynamic = 'force-dynamic';

async function respond(pilotId: string) {
  const pilot = await currentPilot();
  const claims = await pilotClaims(pilotId);
  const now = Date.now();
  const f = await settledFactory(pilotId, claims, now);
  return ok({ pilot: pilot && publicPilot(pilot), now, factory: { layout: f.layout, sim: f.sim, settledAt: f.settledAt }, ore: siloOre(claims, pilotId, f, now) });
}

/** Your factory floor, run forward to now. */
export async function GET() {
  const pilot = await currentPilot();
  if (!pilot) return fail(401, 'Not logged in');
  return respond(pilot.id);
}

/** Edit your floor: place, belts, remove or recipe (see FactoryOp). */
export async function POST(req: Request) {
  const pilot = await currentPilot();
  if (!pilot) return fail(401, 'Not logged in');
  const op = (await readJson(req)) as unknown as FactoryOp;
  try {
    await editFactory(pilot.id, await pilotClaims(pilot.id), op);
  } catch (err) {
    if (err instanceof FactoryError) return fail(409, err.message);
    throw err;
  }
  return respond(pilot.id);
}
