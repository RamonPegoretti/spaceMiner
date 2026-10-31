import 'server-only';
import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { STARTING_CREDITS } from '@/game/resources';

export interface Pilot {
  id: string;
  name: string;
  email: string | null;
  passwordHash: string | null;
  isTest: boolean;
  credits: number;
  createdAt: string;
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
}

class MemoryPilotStore implements PilotStore {
  private pilots = new Map<string, Pilot>();
  async create(p: NewPilot) {
    const pilot: Pilot = {
      id: randomUUID(),
      name: p.name,
      email: p.email ?? null,
      passwordHash: p.passwordHash ?? null,
      isTest: p.isTest ?? false,
      credits: STARTING_CREDITS,
      createdAt: new Date().toISOString(),
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
});

class PostgresPilotStore implements PilotStore {
  private sql;
  private ready: Promise<unknown> | null = null;
  constructor(url: string) {
    this.sql = neon(url);
  }
  /** Creates the table on first use so a fresh database needs no manual setup. */
  private init() {
    this.ready ??= Promise.resolve(this.sql`
      CREATE TABLE IF NOT EXISTS pilots (
        id uuid PRIMARY KEY,
        name text NOT NULL UNIQUE,
        email text UNIQUE,
        password_hash text,
        is_test boolean NOT NULL DEFAULT false,
        credits bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`).catch((err) => {
      this.ready = null; // try again on the next request
      throw err;
    });
    return this.ready;
  }
  async create(p: NewPilot) {
    await this.init();
    const rows = await this.sql`
      INSERT INTO pilots (id, name, email, password_hash, is_test, credits)
      VALUES (${randomUUID()}, ${p.name}, ${p.email ?? null}, ${p.passwordHash ?? null}, ${p.isTest ?? false}, ${STARTING_CREDITS})
      RETURNING *`;
    return toPilot(rows[0]);
  }
  async byId(id: string) {
    await this.init();
    const rows = await this.sql`SELECT * FROM pilots WHERE id = ${id}`;
    return rows[0] ? toPilot(rows[0]) : null;
  }
  async byEmail(email: string) {
    await this.init();
    const rows = await this.sql`SELECT * FROM pilots WHERE email = ${email}`;
    return rows[0] ? toPilot(rows[0]) : null;
  }
  async nameTaken(name: string) {
    await this.init();
    const rows = await this.sql`SELECT 1 FROM pilots WHERE lower(name) = lower(${name})`;
    return rows.length > 0;
  }
}

const g = globalThis as unknown as { __pilotStore?: PilotStore };

export function pilots(): PilotStore {
  g.__pilotStore ??= process.env.DATABASE_URL
    ? new PostgresPilotStore(process.env.DATABASE_URL)
    : new MemoryPilotStore();
  return g.__pilotStore;
}

export const usingDatabase = () => Boolean(process.env.DATABASE_URL);
