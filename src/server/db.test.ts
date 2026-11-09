import { describe, expect, it } from 'vitest';
import { usingDatabase } from './db';

describe('usingDatabase', () => {
  it('uses Postgres when DATABASE_URL is set', () => {
    expect(usingDatabase({ DATABASE_URL: 'postgres://x', VERCEL_ENV: 'production' })).toBe(true);
  });
  it('falls back to memory for local play', () => {
    expect(usingDatabase({ NODE_ENV: 'development' })).toBe(false);
    expect(usingDatabase({ VERCEL_ENV: 'preview' })).toBe(false);
  });
  it('refuses to run production without a database', () => {
    expect(() => usingDatabase({ VERCEL_ENV: 'production', NODE_ENV: 'production' })).toThrow('DATABASE_URL is not set');
  });
});
