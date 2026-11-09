import 'server-only';
import { randomUUID } from 'node:crypto';
import { checkRoute, HAULER, logistics, RouteError, type HaulerRec } from '@/game/haulers';
import { REFUND } from '@/game/resources';
import { db, usingDatabase } from './db';
import { MemoryPilotStore, pilots } from './pilots';
import { pilotClaims } from './world';

interface FleetStore {
  /** All haulers the pilot ever had, scrapped ones included (their past trips still count). */
  list(pilotId: string): Promise<HaulerRec[]>;
  /** Pays and adds a hauler in one step. False if credits ran short or the fleet is full. */
  buy(h: HaulerRec, cost: number, max: number): Promise<boolean>;
  /** Scraps an active hauler and refunds `refund`. False if there was none. */
  scrap(id: string, pilotId: string, now: number, refund: number): Promise<boolean>;
  /** Forgets a deleted pilot's haulers. */
  removePilot(pilotId: string): Promise<void>;
}

class MemoryFleetStore implements FleetStore {
  rows: HaulerRec[] = [];
  private pilot = (id: string) => (pilots() as MemoryPilotStore).pilots.get(id);
  async list(pilotId: string) {
    return this.rows.filter((h) => h.pilotId === pilotId).map((h) => ({ ...h, route: [...h.route] }));
  }
  async buy(h: HaulerRec, cost: number, max: number) {
    const p = this.pilot(h.pilotId);
    if (!p || p.credits < cost || this.rows.filter((x) => x.pilotId === h.pilotId && x.removedAt === null).length >= max) return false;
    p.credits -= cost;
    this.rows.push({ ...h });
    return true;
  }
  async scrap(id: string, pilotId: string, now: number, refund: number) {
    const h = this.rows.find((x) => x.id === id && x.pilotId === pilotId && x.removedAt === null);
    if (!h) return false;
    h.removedAt = now;
    this.pilot(pilotId)!.credits += refund;
    return true;
  }
  async removePilot(pilotId: string) {
    this.rows = this.rows.filter((h) => h.pilotId !== pilotId);
  }
}

const iso = (t: number) => new Date(t).toISOString();
const ms = (v: unknown) => (v == null ? null : new Date(v as string).getTime());

class PostgresFleetStore implements FleetStore {
  async list(pilotId: string) {
    const sql = await db();
    const rows = await sql`SELECT * FROM haulers WHERE pilot_id = ${pilotId} ORDER BY created_at`;
    return rows.map((r) => ({
      id: String(r.id),
      pilotId: String(r.pilot_id),
      route: (typeof r.route === 'string' ? JSON.parse(r.route) : r.route) as string[],
      createdAt: ms(r.created_at)!,
      removedAt: ms(r.removed_at),
    }));
  }
  async buy(h: HaulerRec, cost: number, max: number) {
    const sql = await db();
    const rows = await sql`
      WITH paid AS (
        UPDATE pilots SET credits = credits - ${cost}
        WHERE id = ${h.pilotId} AND credits >= ${cost}
          AND (SELECT count(*) FROM haulers WHERE pilot_id = ${h.pilotId} AND removed_at IS NULL) < ${max}
        RETURNING id
      )
      INSERT INTO haulers (id, pilot_id, route, created_at)
      SELECT ${h.id}, id, ${JSON.stringify(h.route)}::jsonb, ${iso(h.createdAt)} FROM paid
      RETURNING id`;
    return rows.length > 0;
  }
  async scrap(id: string, pilotId: string, now: number, refund: number) {
    const sql = await db();
    const rows = await sql`
      WITH gone AS (
        UPDATE haulers SET removed_at = ${iso(now)} WHERE id = ${id} AND pilot_id = ${pilotId} AND removed_at IS NULL RETURNING pilot_id
      )
      UPDATE pilots SET credits = credits + ${refund} WHERE id IN (SELECT pilot_id FROM gone) RETURNING id`;
    return rows.length > 0;
  }
  async removePilot() {
    // Haulers are deleted with the pilot row (ON DELETE CASCADE).
  }
}

const g = globalThis as unknown as { __fleetStore?: FleetStore };
const store = (): FleetStore => (g.__fleetStore ??= usingDatabase() ? new PostgresFleetStore() : new MemoryFleetStore());

export const haulersOf = (pilotId: string) => store().list(pilotId);

/** Drops a deleted pilot's haulers from storage. */
export const removePilotHaulers = (pilotId: string) => store().removePilot(pilotId);

/** Everything about a pilot's ore flow right now: claims, haulers, stockpiles and the silo supply. */
export async function pilotLogistics(pilotId: string, now = Date.now()) {
  const [claims, haulers] = await Promise.all([pilotClaims(pilotId), haulersOf(pilotId)]);
  return { haulers, logistics: logistics(claims, pilotId, haulers, now) };
}

export class FleetError extends Error {}

export async function buyHauler(pilotId: string, route: unknown) {
  let checked: string[];
  try {
    checked = checkRoute(route);
  } catch (err) {
    if (err instanceof RouteError) throw new FleetError(err.message);
    throw err;
  }
  const ok = await store().buy({ id: randomUUID(), pilotId, route: checked, createdAt: Date.now(), removedAt: null }, HAULER.cost, HAULER.max);
  if (!ok) {
    const p = await pilots().byId(pilotId);
    throw new FleetError(p && p.credits < HAULER.cost ? `A hauler costs ${HAULER.cost.toLocaleString('en-US')} credits.` : `You can run ${HAULER.max} haulers at once.`);
  }
}

export async function scrapHauler(pilotId: string, id: string) {
  if (!(await store().scrap(id, pilotId, Date.now(), Math.floor(HAULER.cost * REFUND)))) throw new FleetError('That hauler is already gone.');
}
