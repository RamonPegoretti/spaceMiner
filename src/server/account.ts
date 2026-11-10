import 'server-only';
import { removePilotFactory, settledFactory } from './factory';
import { pilotLogistics, removePilotHaulers } from './fleet';
import { pilots, type Pilot } from './pilots';
import { pilotClaims, removePilotClaims } from './world';

/** Deletes a pilot's game data from the memory stores (Postgres cascades from the pilot row). */
async function removeGameData(pilotId: string) {
  await removePilotClaims(pilotId);
  await removePilotFactory(pilotId);
  await removePilotHaulers(pilotId);
}

/** Deletes a pilot with their claims (which frees their fields), factory and haulers. */
export async function deletePilot(pilotId: string) {
  await pilots().remove(pilotId);
  await removeGameData(pilotId);
}

const DEFAULT_TEST_PILOT_DAYS = 7;
export function testPilotRetentionDays(env: Record<string, string | undefined> = process.env) {
  const n = Number(env.TEST_PILOT_RETENTION_DAYS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TEST_PILOT_DAYS;
}

/** Deletes test pilots nobody has used for TEST_PILOT_RETENTION_DAYS (default 7), with their claims and factories. */
export async function purgeIdleTestPilots(now = Date.now()) {
  const gone = await pilots().purgeIdleTestPilots(testPilotRetentionDays(), now);
  for (const id of gone) await removeGameData(id);
  return gone;
}

/** Everything stored about a pilot (account, claims, haulers, factory), for "Download my data". Never includes the password hash. */
export async function exportPilot(pilot: Pilot) {
  const claims = await pilotClaims(pilot.id);
  const { haulers, logistics } = await pilotLogistics(pilot.id);
  const factory = await settledFactory(pilot.id, logistics.supply);
  const iso = (t: number | null) => (t == null ? null : new Date(t).toISOString());
  return {
    exportedAt: new Date().toISOString(),
    pilot: { id: pilot.id, name: pilot.name, email: pilot.email, isTest: pilot.isTest, credits: pilot.credits, createdAt: pilot.createdAt, lastSeenAt: pilot.lastSeenAt },
    claims: claims.map((c) => ({ id: c.id, field: c.slot, generation: c.generation, ore: c.ore, rate: c.rate, startRemaining: c.startRemaining, startedAt: iso(c.startedAt), endedAt: iso(c.endedAt) })),
    haulers: haulers.map((h) => ({ id: h.id, route: h.route, createdAt: iso(h.createdAt), removedAt: iso(h.removedAt) })),
    factory: { layout: factory.layout, sim: factory.sim, settledAt: iso(factory.settledAt) },
  };
}
