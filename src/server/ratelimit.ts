import 'server-only';
import { createHash } from 'node:crypto';
import { db, usingDatabase } from './db';

/**
 * Fixed-window rate limits. Each key counts hits per window; a window is
 * `windowSec` long and starts at a multiple of it. Postgres when configured,
 * memory otherwise. Keys hold a hash of the IP address, never the raw IP.
 */

/** Start of the window that `now` falls in, in ms. */
export const windowStart = (now: number, windowSec: number) => Math.floor(now / (windowSec * 1000)) * windowSec * 1000;

export interface Rule {
  /** e.g. 'login-email' */
  name: string;
  max: number;
  windowSec: number;
}

export const RULES = {
  loginFailEmail: { name: 'login-fail-email', max: 10, windowSec: 15 * 60 },
  loginFailIp: { name: 'login-fail-ip', max: 30, windowSec: 15 * 60 },
  register: { name: 'register-ip', max: 10, windowSec: 60 * 60 },
  devLogin: { name: 'dev-ip', max: 10, windowSec: 60 * 60 },
} satisfies Record<string, Rule>;

interface Counter {
  count(key: string, start: number): Promise<number>;
  add(key: string, start: number): Promise<number>;
  reset(key: string): Promise<void>;
}

export class MemoryCounter implements Counter {
  rows = new Map<string, { start: number; count: number }>();
  async count(key: string, start: number) {
    const r = this.rows.get(key);
    return r && r.start === start ? r.count : 0;
  }
  async add(key: string, start: number) {
    const r = this.rows.get(key);
    const count = r && r.start === start ? r.count + 1 : 1;
    this.rows.set(key, { start, count });
    if (this.rows.size > 50_000) for (const [k, v] of this.rows) if (v.start < start) this.rows.delete(k);
    return count;
  }
  async reset(key: string) {
    this.rows.delete(key);
  }
}

class PostgresCounter implements Counter {
  async count(key: string, start: number) {
    const sql = await db();
    const rows = await sql`SELECT count FROM rate_limits WHERE key = ${key} AND window_start = ${new Date(start).toISOString()}`;
    return rows[0] ? Number(rows[0].count) : 0;
  }
  async add(key: string, start: number) {
    const sql = await db();
    const rows = await sql`
      INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${new Date(start).toISOString()}, 1)
      ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
      RETURNING count`;
    // Now and then, clear out windows older than a day.
    if (Math.random() < 0.05) await sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`;
    return Number(rows[0].count);
  }
  async reset(key: string) {
    const sql = await db();
    await sql`DELETE FROM rate_limits WHERE key = ${key}`;
  }
}

const g = globalThis as unknown as { __rateCounter?: Counter };
const counter = (): Counter => (g.__rateCounter ??= usingDatabase() ? new PostgresCounter() : new MemoryCounter());

const hash = (s: string) => createHash('sha256').update(s).digest('base64url').slice(0, 32);
const fullKey = (rule: Rule, id: string) => `${rule.name}:${hash(id)}`;

/** True while `id` is under the rule's limit (does not count a hit). */
export async function allowed(rule: Rule, id: string, now = Date.now(), c: Counter = counter()) {
  return (await c.count(fullKey(rule, id), windowStart(now, rule.windowSec))) < rule.max;
}

/** Counts a hit. */
export async function hit(rule: Rule, id: string, now = Date.now(), c: Counter = counter()) {
  return c.add(fullKey(rule, id), windowStart(now, rule.windowSec));
}

/** Counts a hit and says whether it was within the limit. */
export async function take(rule: Rule, id: string, now = Date.now(), c: Counter = counter()) {
  return (await hit(rule, id, now, c)) <= rule.max;
}

export async function reset(rule: Rule, id: string, c: Counter = counter()) {
  await c.reset(fullKey(rule, id));
}

/** The caller's IP. On Vercel the first x-forwarded-for entry is set by the platform. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || req.headers.get('x-real-ip')?.trim() || 'unknown';
}
