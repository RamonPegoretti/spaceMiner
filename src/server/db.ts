import 'server-only';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

/**
 * The Postgres connection and schema. Tables are created on first use,
 * so a fresh database needs no manual setup.
 */
let client: NeonQueryFunction<false, false> | null = null;
let ready: Promise<unknown> | null = null;

export const usingDatabase = () => Boolean(process.env.DATABASE_URL);

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
