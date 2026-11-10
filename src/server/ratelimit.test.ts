import { describe, expect, it } from 'vitest';
import { allowed, clientIp, hit, MemoryCounter, reset, take, windowStart, type Rule } from './ratelimit';

const rule: Rule = { name: 'test', max: 3, windowSec: 60 };
const T0 = Date.UTC(2026, 10, 9, 12, 0, 0);

describe('rate limiting', () => {
  it('puts times in fixed windows', () => {
    expect(windowStart(T0, 60)).toBe(T0);
    expect(windowStart(T0 + 59_999, 60)).toBe(T0);
    expect(windowStart(T0 + 60_000, 60)).toBe(T0 + 60_000);
    expect(windowStart(T0 + 7 * 60_000, 15 * 60)).toBe(T0);
  });

  it('allows max hits per window, then blocks until the next window', async () => {
    const c = new MemoryCounter();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await take(rule, '1.2.3.4', T0 + i, c));
    expect(results).toEqual([true, true, true, false]);
    expect(await take(rule, '1.2.3.4', T0 + 60_000, c)).toBe(true);
  });

  it('counts each id separately and can reset one', async () => {
    const c = new MemoryCounter();
    for (let i = 0; i < 3; i++) await hit(rule, 'a@example.com', T0, c);
    expect(await allowed(rule, 'a@example.com', T0, c)).toBe(false);
    expect(await allowed(rule, 'b@example.com', T0, c)).toBe(true);
    await reset(rule, 'a@example.com', c);
    expect(await allowed(rule, 'a@example.com', T0, c)).toBe(true);
  });

  it('never stores the raw IP or email', async () => {
    const c = new MemoryCounter();
    await hit(rule, '203.0.113.7', T0, c);
    await hit(rule, 'someone@example.com', T0, c);
    for (const k of c.rows.keys()) {
      expect(k).not.toContain('203.0.113.7');
      expect(k).not.toContain('someone');
    }
  });

  it('takes the client IP from the first x-forwarded-for entry', () => {
    const req = (h: Record<string, string>) => new Request('https://x.test/', { headers: h });
    expect(clientIp(req({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' }))).toBe('198.51.100.1');
    expect(clientIp(req({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(req({}))).toBe('unknown');
  });
});
