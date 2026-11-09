import 'server-only';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

/**
 * The Postgres connection and schema. Tables are created on first use,
 * so a fresh database needs no manual setup.
 */
let client: NeonQueryFunction<false, false> | null = null;
let ready: Promise<unknown> | null = null;

/**
 * True when a Postgres database is configured. Without one the app keeps everything in memory,
 * which is fine for local play but would silently lose every pilot in production, so a
 * production deployment without DATABASE_URL refuses to run instead.
 */
export function usingDatabase(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DATABASE_URL) return true;
  if (env.VERCEL_ENV === 'production') throw new Error('DATABASE_URL is not set');
  return false;
}

async function migrate(sql: NeonQueryFunction<false, false>) {
  await sql`
    CREATE TABLE IF NOT EXISTS pilots (
      id uuid PRIMARY KEY,
      name text NOT NULL UNIQUE,
      email text UNIQUE,
      password_hash text,
      is_test boolean NOT NULL DEFAULT false,
      credits bigint NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS field_slots (
      slot text PRIMARY KEY,
      generation int NOT NULL,
      spawned_at timestamptz NOT NULL
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS claims (
      id uuid PRIMARY KEY,
      slot text NOT NULL,
      generation int NOT NULL,
      pilot_id uuid NOT NULL REFERENCES pilots(id) ON DELETE CASCADE,
      ore text NOT NULL,
      rate double precision NOT NULL,
      start_remaining double precision NOT NULL,
      started_at timestamptz NOT NULL,
      ended_at timestamptz
    )`;
  // One open claim per field: the database itself settles a race between two pilots.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS claims_one_open_per_slot ON claims (slot) WHERE ended_at IS NULL`;
  await sql`CREATE INDEX IF NOT EXISTS claims_by_pilot ON claims (pilot_id)`;
  await sql`
    CREATE TABLE IF NOT EXISTS factories (
      pilot_id uuid PRIMARY KEY REFERENCES pilots(id) ON DELETE CASCADE,
      layout jsonb NOT NULL,
      sim jsonb NOT NULL,
      settled_at timestamptz NOT NULL,
      version int NOT NULL DEFAULT 0
    )`;
  // Bumped to log a pilot out everywhere; login cookies carry the version they were made with.
  await sql`ALTER TABLE pilots ADD COLUMN IF NOT EXISTS session_version int NOT NULL DEFAULT 0`;
  // Last activity, updated at most hourly, so idle test pilots can be deleted.
  await sql`ALTER TABLE pilots ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now()`;
  // Request counters for rate limiting. Keys never hold a raw IP address, only a hash.
  await sql`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key text NOT NULL,
      window_start timestamptz NOT NULL,
      count int NOT NULL,
      PRIMARY KEY (key, window_start)
    )`;
}

/** The SQL client, after making sure the tables exist. */
export async function db() {
  client ??= neon(process.env.DATABASE_URL!);
  const sql = client;
  ready ??= migrate(sql).catch((err) => {
    ready = null; // try again on the next request
    throw err;
  });
  await ready;
  return sql;
}
