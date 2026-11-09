import type { Ore } from './resources';
import { fieldSpawn, type FieldSlot } from './galaxy';

/**
 * Claim and depletion rules. Pure functions of stored records and the time,
 * so nothing has to tick on the server: ore mined is worked out from timestamps.
 */
export const CLAIM_COST = 2_400;
/** Tonnes per minute a starter mining rig pulls from a claimed field. */
export const RIG_RATE = 25;
export const MAX_CLAIMS = 3;
/** A dry field gets new rocks this long after it runs out. */
export const RESPAWN_MS = 60 * 60_000;

/** One pilot mining one field generation, from startedAt until it ends or runs dry. */
export interface ClaimRec {
  id: string;
  slot: string;
  generation: number;
  pilotId: string;
  pilotName: string;
  ore: Ore;
  /** Tonnes per minute. */
  rate: number;
  /** Tonnes left in the field when the claim started. */
  startRemaining: number;
  startedAt: number;
  endedAt: number | null;
}

/** Which generation of field a slot holds. A slot with no record is on generation 0. */
export interface SlotRec {
  slot: string;
  generation: number;
  spawnedAt: number;
}

const MIN = 60_000;

/** When this claim empties its field, if nothing stops it first. */
export const claimDryAt = (c: ClaimRec) => c.startedAt + (c.startRemaining / c.rate) * MIN;

/** Tonnes this claim has mined so far. */
export function mined(c: ClaimRec, now: number) {
  const end = Math.min(now, c.endedAt ?? Infinity);
  return Math.min(c.startRemaining, Math.max(0, (c.rate * (end - c.startedAt)) / MIN));
}

/** Still mining right now: not abandoned and the field is not empty. */
export const isActive = (c: ClaimRec, now: number) => c.endedAt === null && now < claimDryAt(c);

export interface FieldState {
  slot: string;
  generation: number;
  spawnedAt: number;
  name: string;
  ore: Ore;
  initial: number;
  remaining: number;
  /** Tonnes per minute leaving the field now. */
  rate: number;
  claim: ClaimRec | null;
  /** Set while the field is dry. */
  respawnAt: number | null;
  /** True when the stored generation is out of date because the field has respawned. */
  respawned: boolean;
  /** Claims of this slot left open after their field ran dry; they should be closed at these times. */
  stale: { id: string; endedAt: number }[];
}

export function resolveField(slot: FieldSlot, rec: SlotRec | undefined, claims: ClaimRec[], now: number): FieldState {
  let generation = rec?.generation ?? 0;
  let spawnedAt = rec?.spawnedAt ?? 0;
  const own = claims.filter((c) => c.slot === slot.id);
  const stale = own.filter((c) => c.endedAt === null && now >= claimDryAt(c)).map((c) => ({ id: c.id, endedAt: claimDryAt(c) }));

  let spawn = fieldSpawn(slot, generation);
  const gen = own.filter((c) => c.generation === generation);
  let remaining = spawn.initial - gen.reduce((sum, c) => sum + mined(c, now), 0);
  if (remaining < 0.01) remaining = 0; // rounding dust
  let claim = gen.find((c) => isActive(c, now)) ?? null;
  let respawnAt: number | null = null;
  let respawned = false;

  if (remaining <= 0 && !claim) {
    const dryAt = Math.max(spawnedAt, ...gen.map((c) => Math.min(c.endedAt ?? Infinity, claimDryAt(c))));
    respawnAt = dryAt + RESPAWN_MS;
    if (now >= respawnAt) {
      generation += 1;
      spawnedAt = respawnAt;
      spawn = fieldSpawn(slot, generation);
      remaining = spawn.initial;
      respawnAt = null;
      respawned = true;
      claim = null;
    }
  }

  return {
    slot: slot.id,
    generation,
    spawnedAt,
    name: spawn.name,
    ore: spawn.ore,
    initial: spawn.initial,
    remaining,
    rate: claim ? claim.rate : 0,
    claim,
    respawnAt,
    respawned,
    stale,
  };
}

/** A pilot's ore: everything their claims have mined, and how fast it is growing. */
export function pilotOre(claims: ClaimRec[], pilotId: string, now: number) {
  const ore: Partial<Record<Ore, { amount: number; rate: number }>> = {};
  for (const c of claims) {
    if (c.pilotId !== pilotId) continue;
    const o = (ore[c.ore] ??= { amount: 0, rate: 0 });
    o.amount += mined(c, now);
    if (isActive(c, now)) o.rate += c.rate;
  }
  return ore;
}
