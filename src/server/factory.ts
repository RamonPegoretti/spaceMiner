import 'server-only';
import type { Logistics } from '@/game/haulers';
import { applyOp, emptySim, FloorError, isLayout, pruneSim, simulate, starterLayout, type FactoryOp, type Layout, type Sim } from '@/game/factory';
import { ORES, RECIPE_BY_ID, type Ore } from '@/game/resources';
import { db, usingDatabase } from './db';
import { MemoryPilotStore, pilots } from './pilots';

const MIN = 60_000;

export interface FactoryRec {
  layout: Layout;
  sim: Sim;
  settledAt: number;
  version: number;
}

interface FactoryStore {
  get(pilotId: string): Promise<FactoryRec | null>;
  create(pilotId: string, f: FactoryRec): Promise<void>;
  /** Saves if nobody saved since `version`, charging `cost` credits. False if the version moved on or credits ran short. */
  save(pilotId: string, f: FactoryRec, version: number, cost: number): Promise<boolean>;
  /** Forgets a deleted pilot's factory. */
  removePilot(pilotId: string): Promise<void>;
}

class MemoryFactoryStore implements FactoryStore {
  rows = new Map<string, FactoryRec>();
  async get(pilotId: string) {
    const f = this.rows.get(pilotId);
    return f ? structuredClone(f) : null;
  }
  async create(pilotId: string, f: FactoryRec) {
    if (!this.rows.has(pilotId)) this.rows.set(pilotId, structuredClone(f));
  }
  async save(pilotId: string, f: FactoryRec, version: number, cost: number) {
    const cur = this.rows.get(pilotId);
    const pilot = (pilots() as MemoryPilotStore).pilots.get(pilotId);
    if (!cur || cur.version !== version || !pilot || pilot.credits < cost) return false;
    pilot.credits -= cost;
    this.rows.set(pilotId, { ...structuredClone(f), version: version + 1 });
    return true;
  }
  async removePilot(pilotId: string) {
    this.rows.delete(pilotId);
  }
}

const json = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

class PostgresFactoryStore implements FactoryStore {
  async get(pilotId: string) {
    const sql = await db();
    const rows = await sql`SELECT * FROM factories WHERE pilot_id = ${pilotId}`;
    if (!rows[0]) return null;
    const layout = json(rows[0].layout);
    return {
      layout: isLayout(layout) ? layout : starterLayout(),
      sim: (json(rows[0].sim) as Sim) ?? emptySim(),
      settledAt: new Date(rows[0].settled_at as string).getTime(),
      version: Number(rows[0].version),
    };
  }
  async create(pilotId: string, f: FactoryRec) {
    const sql = await db();
    await sql`
      INSERT INTO factories (pilot_id, layout, sim, settled_at, version)
      VALUES (${pilotId}, ${JSON.stringify(f.layout)}::jsonb, ${JSON.stringify(f.sim)}::jsonb, ${new Date(f.settledAt).toISOString()}, 0)
      ON CONFLICT (pilot_id) DO NOTHING`;
  }
  async save(pilotId: string, f: FactoryRec, version: number, cost: number) {
    const sql = await db();
    // One statement: the floor only changes if the pilot can pay, and the pilot only pays if the floor changed.
    const rows = await sql`
      WITH saved AS (
        UPDATE factories
        SET layout = ${JSON.stringify(f.layout)}::jsonb, sim = ${JSON.stringify(f.sim)}::jsonb,
            settled_at = ${new Date(f.settledAt).toISOString()}, version = version + 1
        WHERE pilot_id = ${pilotId} AND version = ${version}
          AND EXISTS (SELECT 1 FROM pilots WHERE id = ${pilotId} AND credits >= ${cost})
        RETURNING pilot_id
      )
      UPDATE pilots SET credits = credits - ${cost} WHERE id IN (SELECT pilot_id FROM saved) RETURNING id`;
    return rows.length > 0;
  }
  async removePilot() {
    // The factory row is deleted with the pilot row (ON DELETE CASCADE).
  }
}

const g = globalThis as unknown as { __factoryStore?: FactoryStore };
const store = (): FactoryStore => (g.__factoryStore ??= usingDatabase() ? new PostgresFactoryStore() : new MemoryFactoryStore());

/** Loads the pilot's factory (making the starter floor on first visit) and runs it up to now. */
export async function settledFactory(pilotId: string, supply: Logistics['supply'], now = Date.now()) {
  let f = await store().get(pilotId);
  if (!f) {
    f = { layout: starterLayout(), sim: emptySim(), settledAt: now, version: 0 };
    await store().create(pilotId, f);
    f = (await store().get(pilotId)) ?? f;
  }
  const minutes = Math.floor((now - f.settledAt) / MIN);
  if (minutes < 1) return f;
  const start = f.settledAt;
  const minedBy = (ore: Ore, minute: number) => supply(ore, start + minute * MIN);
  const next: FactoryRec = { ...f, sim: simulate(f.layout, f.sim, minutes, minedBy), settledAt: start + minutes * MIN };
  // If another request settled first, theirs wins; ours was the same maths.
  if (await store().save(pilotId, next, f.version, 0)) return { ...next, version: f.version + 1 };
  return (await store().get(pilotId)) ?? next;
}

/** Drops a deleted pilot's factory from storage. */
export const removePilotFactory = (pilotId: string) => store().removePilot(pilotId);

export class FactoryError extends Error {}

export async function editFactory(pilotId: string, supply: Logistics['supply'], op: FactoryOp) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const f = await settledFactory(pilotId, supply);
    let result;
    try {
      result = applyOp(f.layout, op);
    } catch (err) {
      if (err instanceof FloorError) throw new FactoryError(err.message);
      throw err;
    }
    const sim = pruneSim(result.layout, f.layout, f.sim);
    if (await store().save(pilotId, { ...f, layout: result.layout, sim }, f.version, result.cost)) return;
    const pilot = await pilots().byId(pilotId);
    if (pilot && pilot.credits < result.cost) throw new FactoryError(`That costs ${result.cost.toLocaleString('en-US')} credits.`);
  }
  throw new FactoryError('The floor changed while you were editing. Try again.');
}

/** Ore in the silo: everything that reached home minus what the factory took, and how fast it is changing. */
export function siloOre(lg: Logistics, f: FactoryRec, now: number) {
  const out: Partial<Record<Ore, { amount: number; rate: number }>> = {};
  for (const ore of ORES) {
    const got = lg.supply(ore, now);
    const used = f.sim.oreUsed[ore] ?? 0;
    let rate = lg.homeRate[ore] ?? 0;
    for (const machine of f.layout.machines) {
      const r = machine.recipe ? RECIPE_BY_ID.get(machine.recipe) : null;
      if (machine.kind === 'intake' && r?.output === ore) rate -= f.sim.machines[machine.id]?.rate ?? 0;
    }
    const amount = Math.max(0, got - used);
    if (got || used) out[ore] = { amount, rate: amount <= 0 && rate < 0 ? 0 : rate };
  }
  return out;
}
