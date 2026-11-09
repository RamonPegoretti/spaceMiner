import 'server-only';
import { removePilotFactory, settledFactory } from './factory';
import { pilots, type Pilot } from './pilots';
import { pilotClaims, removePilotClaims } from './world';

/** Deletes a pilot with their claims (which frees their fields) and their factory. */
export async function deletePilot(pilotId: string) {
  await pilots().remove(pilotId);
  await removePilotClaims(pilotId);
  await removePilotFactory(pilotId);
}

const DEFAULT_TEST_PILOT_DAYS = 7;
export function testPilotRetentionDays(env: Record<string, string | undefined> = process.env) {
  const n = Number(env.TEST_PILOT_RETENTION_DAYS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TEST_PILOT_DAYS;
}

/** Deletes test pilots nobody has used for TEST_PILOT_RETENTION_DAYS (default 7), with their claims and factories. */
export async function purgeIdleTestPilots(now = Date.now()) {
  const gone = await pilots().purgeIdleTestPilots(testPilotRetentionDays(), now);
  for (const id of gone) {
    await removePilotClaims(id);
    await removePilotFactory(id);
  }
  return gone;
}

/** Everything stored about a pilot, for "Download my data". Never includes the password hash. */
export async function exportPilot(pilot: Pilot) {
  const claims = await pilotClaims(pilot.id);
  const factory = await settledFactory(pilot.id, claims);
  const iso = (t: number | null) => (t == null ? null : new Date(t).toISOString());
  return {
    exportedAt: new Date().toISOString(),
    pilot: { id: pilot.id, name: pilot.name, email: pilot.email, isTest: pilot.isTest, credits: pilot.credits, createdAt: pilot.createdAt, lastSeenAt: pilot.lastSeenAt },
    claims: claims.map((c) => ({ id: c.id, field: c.slot, generation: c.generation, ore: c.ore, rate: c.rate, startRemaining: c.startRemaining, startedAt: iso(c.startedAt), endedAt: iso(c.endedAt) })),
    factory: { layout: factory.layout, sim: factory.sim, settledAt: iso(factory.settledAt) },
  };
}
