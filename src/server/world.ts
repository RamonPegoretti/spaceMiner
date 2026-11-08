import 'server-only';
import { randomUUID } from 'node:crypto';
import { CLAIM_COST, isActive, MAX_CLAIMS, pilotOre, resolveField, RIG_RATE, type ClaimRec, type FieldState, type SlotRec } from '@/game/claims';
import { galaxy } from '@/game/galaxy';
import type { Ore } from '@/game/resources';
import { db, usingDatabase } from './db';
import { MemoryPilotStore, pilots } from './pilots';

/** Storage for the changing parts of the galaxy: which generation each field is on, and claims. */
interface WorldStore {
  /** Slot records, claims of each slot's current generation, open claims, and all of this pilot's claims. */
  load(pilotId: string): Promise<{ slots: SlotRec[]; claims: ClaimRec[] }>;
  closeClaims(ends: { id: string; endedAt: number }[]): Promise<void>;
  setGeneration(rec: SlotRec): Promise<void>;
  /** Takes the credits and opens the claim in one step. Returns false if credits ran short or the field was taken. */
  openClaim(c: Omit<ClaimRec, 'pilotName' | 'endedAt'>, cost: number): Promise<boolean>;
  /** Ends an open claim owned by this pilot. Returns false if there was none. */
  endClaim(id: string, pilotId: string, now: number): Promise<boolean>;
}

class MemoryWorldStore implements WorldStore {
  slots = new Map<string, SlotRec>();
  claims: ClaimRec[] = [];
  private pilotStore = () => pilots() as MemoryPilotStore;
  async load() {
    const names = this.pilotStore().pilots;
    return { slots: [...this.slots.values()], claims: this.claims.map((c) => ({ ...c, pilotName: names.get(c.pilotId)?.name ?? '?' })) };
  }
  async closeClaims(ends: { id: string; endedAt: number }[]) {
    for (const e of ends) {
      const c = this.claims.find((x) => x.id === e.id && x.endedAt === null);
      if (c) c.endedAt = e.endedAt;
    }
  }
  async setGeneration(rec: SlotRec) {
    const cur = this.slots.get(rec.slot);
    if (!cur || cur.generation < rec.generation) this.slots.set(rec.slot, rec);
  }
  async openClaim(c: Omit<ClaimRec, 'pilotName' | 'endedAt'>, cost: number) {
    const pilot = this.pilotStore().pilots.get(c.pilotId);
    if (!pilot || pilot.credits < cost) return false;
    if (this.claims.some((x) => x.slot === c.slot && x.endedAt === null)) return false;
    pilot.credits -= cost;
    this.claims.push({ ...c, pilotName: pilot.name, endedAt: null });
    return true;
  }
  async endClaim(id: string, pilotId: string, now: number) {
    const c = this.claims.find((x) => x.id === id && x.pilotId === pilotId && x.endedAt === null);
    if (!c) return false;
    c.endedAt = now;
    return true;
  }
}

type Row = Record<string, unknown>;
const ms = (v: unknown) => (v == null ? null : new Date(v as string).getTime());
const toClaim = (r: Row): ClaimRec => ({
  id: String(r.id),
  slot: String(r.slot),
  generation: Number(r.generation),
  pilotId: String(r.pilot_id),
  pilotName: String(r.pilot_name),
  ore: r.ore as Ore,
  rate: Number(r.rate),
  startRemaining: Number(r.start_remaining),
  startedAt: ms(r.started_at)!,
  endedAt: ms(r.ended_at),
});
const iso = (t: number) => new Date(t).toISOString();

class PostgresWorldStore implements WorldStore {
  async load(pilotId: string) {
    const sql = await db();
    const [slots, claims] = await Promise.all([
      sql`SELECT * FROM field_slots`,
      sql`
        SELECT c.*, p.name AS pilot_name
        FROM claims c
        JOIN pilots p ON p.id = c.pilot_id
        LEFT JOIN field_slots f ON f.slot = c.slot
        WHERE c.ended_at IS NULL OR c.generation = coalesce(f.generation, 0) OR c.pilot_id = ${pilotId}`,
    ]);
    return {
      slots: slots.map((r) => ({ slot: String(r.slot), generation: Number(r.generation), spawnedAt: ms(r.spawned_at)! })),
      claims: claims.map(toClaim),
    };
  }
  async closeClaims(ends: { id: string; endedAt: number }[]) {
    const sql = await db();
    for (const e of ends) await sql`UPDATE claims SET ended_at = ${iso(e.endedAt)} WHERE id = ${e.id} AND ended_at IS NULL`;
  }
  async setGeneration(rec: SlotRec) {
    const sql = await db();
    await sql`
      INSERT INTO field_slots (slot, generation, spawned_at) VALUES (${rec.slot}, ${rec.generation}, ${iso(rec.spawnedAt)})
      ON CONFLICT (slot) DO UPDATE SET generation = excluded.generation, spawned_at = excluded.spawned_at
      WHERE field_slots.generation < excluded.generation`;
  }
  async openClaim(c: Omit<ClaimRec, 'pilotName' | 'endedAt'>, cost: number) {
    const sql = await db();
    try {
      // One statement, so the payment and the claim happen together or not at all.
      const rows = await sql`
        WITH paid AS (
          UPDATE pilots SET credits = credits - ${cost}
          WHERE id = ${c.pilotId} AND credits >= ${cost}
            AND NOT EXISTS (SELECT 1 FROM claims WHERE slot = ${c.slot} AND ended_at IS NULL)
          RETURNING id
        )
        INSERT INTO claims (id, slot, generation, pilot_id, ore, rate, start_remaining, started_at)
        SELECT ${c.id}, ${c.slot}, ${c.generation}, id, ${c.ore}, ${c.rate}, ${c.startRemaining}, ${iso(c.startedAt)} FROM paid
        RETURNING id`;
      return rows.length > 0;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return false; // another pilot got there first
      throw err;
    }
  }
  async endClaim(id: string, pilotId: string, now: number) {
    const sql = await db();
    const rows = await sql`UPDATE claims SET ended_at = ${iso(now)} WHERE id = ${id} AND pilot_id = ${pilotId} AND ended_at IS NULL RETURNING id`;
    return rows.length > 0;
  }
}

const g = globalThis as unknown as { __worldStore?: WorldStore };
const store = (): WorldStore => (g.__worldStore ??= usingDatabase() ? new PostgresWorldStore() : new MemoryWorldStore());

/** A field as a pilot sees it. */
export interface FieldView {
  slot: string;
  generation: number;
  name: string;
  ore: Ore;
  initial: number;
  remaining: number;
  rate: number;
  claim: { id: string; pilotName: string; mine: boolean; since: number } | null;
  respawnAt: number | null;
}

export interface WorldView {
  now: number;
  fields: FieldView[];
  ore: Partial<Record<Ore, { amount: number; rate: number }>>;
  claims: number;
}

function resolveAll(slots: SlotRec[], claims: ClaimRec[], now: number) {
  const recs = new Map(slots.map((s) => [s.slot, s]));
  return [...galaxy().slotById.values()].map((slot) => resolveField(slot, recs.get(slot.id), claims, now));
}

const view = (f: FieldState, pilotId: string): FieldView => ({
  slot: f.slot,
  generation: f.generation,
  name: f.name,
  ore: f.ore,
  initial: f.initial,
  remaining: f.remaining,
  rate: f.rate,
  claim: f.claim ? { id: f.claim.id, pilotName: f.claim.pilotName, mine: f.claim.pilotId === pilotId, since: f.claim.startedAt } : null,
  respawnAt: f.respawnAt,
});

export async function worldView(pilotId: string): Promise<WorldView> {
  const now = Date.now();
  const { slots, claims } = await store().load(pilotId);
  const fields = resolveAll(slots, claims, now);
  return {
    now,
    fields: fields.map((f) => view(f, pilotId)),
    ore: pilotOre(claims, pilotId, now),
    claims: claims.filter((c) => c.pilotId === pilotId && isActive(c, now)).length,
  };
}

export class GameError extends Error {}

export async function claimField(pilotId: string, slotId: string) {
  const slot = galaxy().slotById.get(slotId);
  if (!slot) throw new GameError('That field does not exist.');
  const now = Date.now();
  const { slots, claims } = await store().load(pilotId);
  const field = resolveAll(slots, claims, now).find((f) => f.slot === slotId)!;

  if (field.claim) throw new GameError(field.claim.pilotId === pilotId ? 'You already mine this field.' : `${field.claim.pilotName} already claimed this field.`);
  if (field.remaining <= 0) throw new GameError('This field is dry. New rocks are on the way.');
  if (claims.filter((c) => c.pilotId === pilotId && isActive(c, now)).length >= MAX_CLAIMS)
    throw new GameError(`You can run ${MAX_CLAIMS} claims at once. Abandon one first.`);

  if (field.stale.length) await store().closeClaims(field.stale);
  if (field.respawned) await store().setGeneration({ slot: slotId, generation: field.generation, spawnedAt: field.spawnedAt });

  const ok = await store().openClaim(
    { id: randomUUID(), slot: slotId, generation: field.generation, pilotId, ore: field.ore, rate: RIG_RATE, startRemaining: field.remaining, startedAt: now },
    CLAIM_COST,
  );
  if (!ok) {
    const pilot = await pilots().byId(pilotId);
    throw new GameError(pilot && pilot.credits < CLAIM_COST ? `A claim costs ${CLAIM_COST.toLocaleString('en-US')} credits.` : 'Someone claimed this field a moment ago.');
  }
}

export async function abandonClaim(pilotId: string, claimId: string) {
  if (!(await store().endClaim(claimId, pilotId, Date.now()))) throw new GameError('That claim is already closed.');
}
