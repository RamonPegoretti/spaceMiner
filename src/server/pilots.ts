import 'server-only';
import { randomUUID } from 'node:crypto';
import { STARTING_CREDITS } from '@/game/resources';
import { db, usingDatabase } from './db';

export interface Pilot {
  id: string;
  name: string;
  email: string | null;
  passwordHash: string | null;
  isTest: boolean;
  credits: number;
  createdAt: string;
  /** Login cookies made with an older version no longer work. */
  sessionVersion: number;
  lastSeenAt: string;
}

export interface NewPilot {
  name: string;
  email?: string | null;
  passwordHash?: string | null;
  isTest?: boolean;
}

/** Storage for pilots. Postgres in production, memory when no database is configured. */
export interface PilotStore {
  create(p: NewPilot): Promise<Pilot>;
  byId(id: string): Promise<Pilot | null>;
  byEmail(email: string): Promise<Pilot | null>;
  nameTaken(name: string): Promise<boolean>;
  /** Logs the pilot out on every device. */
  bumpSessionVersion(id: string): Promise<void>;
  /** Marks the pilot as active now. */
  touch(id: string): Promise<void>;
  /** Deletes the pilot. In Postgres their claims and factory go with them (ON DELETE CASCADE). */
  remove(id: string): Promise<void>;
  /** Deletes test pilots idle for more than `days`. Returns their ids. Real pilots are never touched. */
  purgeIdleTestPilots(days: number, now?: number): Promise<string[]>;
}

export class MemoryPilotStore implements PilotStore {
  pilots = new Map<string, Pilot>();
  async create(p: NewPilot) {
    const pilot: Pilot = {
      id: randomUUID(),
      name: p.name,
      email: p.email ?? null,
      passwordHash: p.passwordHash ?? null,
      isTest: p.isTest ?? false,
      credits: STARTING_CREDITS,
      createdAt: new Date().toISOString(),
      sessionVersion: 0,
      lastSeenAt: new Date().toISOString(),
    };
    this.pilots.set(pilot.id, pilot);
    return pilot;
  }
  async byId(id: string) {
    return this.pilots.get(id) ?? null;
  }
  async byEmail(email: string) {
    for (const p of this.pilots.values()) if (p.email === email) return p;
    return null;
  }
  async nameTaken(name: string) {
    const n = name.toLowerCase();
    for (const p of this.pilots.values()) if (p.name.toLowerCase() === n) return true;
    return false;
  }
  async bumpSessionVersion(id: string) {
    const p = this.pilots.get(id);
    if (p) p.sessionVersion++;
  }
  async touch(id: string) {
    const p = this.pilots.get(id);
    if (p) p.lastSeenAt = new Date().toISOString();
  }
  async remove(id: string) {
    this.pilots.delete(id);
  }
  async purgeIdleTestPilots(days: number, now = Date.now()) {
    const cutoff = now - days * 86_400_000;
    const gone = [...this.pilots.values()].filter((p) => p.isTest && Date.parse(p.lastSeenAt) < cutoff).map((p) => p.id);
    for (const id of gone) this.pilots.delete(id);
    return gone;
  }
}

type Row = Record<string, unknown>;
const toPilot = (r: Row): Pilot => ({
  id: String(r.id),
  name: String(r.name),
  email: (r.email as string | null) ?? null,
  passwordHash: (r.password_hash as string | null) ?? null,
  isTest: Boolean(r.is_test),
  credits: Number(r.credits),
  createdAt: new Date(r.created_at as string).toISOString(),
  sessionVersion: Number(r.session_version ?? 0),
  lastSeenAt: new Date((r.last_seen_at ?? r.created_at) as string).toISOString(),
});

class PostgresPilotStore implements PilotStore {
  async create(p: NewPilot) {
    const sql = await db();
    const rows = await sql`
      INSERT INTO pilots (id, name, email, password_hash, is_test, credits)
      VALUES (${randomUUID()}, ${p.name}, ${p.email ?? null}, ${p.passwordHash ?? null}, ${p.isTest ?? false}, ${STARTING_CREDITS})
      RETURNING *`;
    return toPilot(rows[0]);
  }
  async byId(id: string) {
    const sql = await db();
    const rows = await sql`SELECT * FROM pilots WHERE id = ${id}`;
    return rows[0] ? toPilot(rows[0]) : null;
  }
  async byEmail(email: string) {
    const sql = await db();
    const rows = await sql`SELECT * FROM pilots WHERE email = ${email}`;
    return rows[0] ? toPilot(rows[0]) : null;
  }
  async nameTaken(name: string) {
    const sql = await db();
    const rows = await sql`SELECT 1 FROM pilots WHERE lower(name) = lower(${name})`;
    return rows.length > 0;
  }
  async bumpSessionVersion(id: string) {
    const sql = await db();
    await sql`UPDATE pilots SET session_version = session_version + 1 WHERE id = ${id}`;
  }
  async touch(id: string) {
    const sql = await db();
    await sql`UPDATE pilots SET last_seen_at = now() WHERE id = ${id}`;
  }
  async remove(id: string) {
    const sql = await db();
    await sql`DELETE FROM pilots WHERE id = ${id}`;
  }
  async purgeIdleTestPilots(days: number, now = Date.now()) {
    const sql = await db();
    const cutoff = new Date(now - days * 86_400_000).toISOString();
    const rows = await sql`DELETE FROM pilots WHERE is_test AND last_seen_at < ${cutoff} RETURNING id`;
    return rows.map((r) => String(r.id));
  }
}

const g = globalThis as unknown as { __pilotStore?: PilotStore };

export function pilots(): PilotStore {
  g.__pilotStore ??= usingDatabase() ? new PostgresPilotStore() : new MemoryPilotStore();
  return g.__pilotStore;
}

export { usingDatabase };
