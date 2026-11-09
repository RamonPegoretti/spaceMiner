import { beforeEach, describe, expect, it } from 'vitest';
import { galaxy } from '@/game/galaxy';
import { deletePilot, exportPilot, purgeIdleTestPilots, testPilotRetentionDays } from './account';
import { editFactory, settledFactory } from './factory';
import { pilots, type MemoryPilotStore } from './pilots';
import { claimField, pilotClaims, worldView } from './world';

// These run against the in-memory stores (no DATABASE_URL in tests).
const g = globalThis as Record<string, unknown>;
beforeEach(() => {
  delete process.env.DATABASE_URL;
  delete g.__pilotStore;
  delete g.__worldStore;
  delete g.__factoryStore;
});

const firstSlot = () => [...galaxy().slotById.keys()][0];

describe('deleting a pilot', () => {
  it('removes the pilot, their claims and factory, and frees their field', async () => {
    const a = await pilots().create({ name: 'Alice', email: 'a@example.com', passwordHash: 'scrypt:x:y' });
    const b = await pilots().create({ name: 'Bob', email: 'b@example.com', passwordHash: 'scrypt:x:y' });
    const slot = firstSlot();
    await claimField(a.id, slot);
    await editFactory(a.id, [], { op: 'belts', belts: [{ x: 0, y: 0, dir: 0 }] });
    expect((await worldView(b.id)).fields.find((f) => f.slot === slot)?.claim?.pilotName).toBe('Alice');

    await deletePilot(a.id);

    expect(await pilots().byId(a.id)).toBeNull();
    expect(await pilotClaims(a.id)).toEqual([]);
    expect((await worldView(b.id)).fields.find((f) => f.slot === slot)?.claim).toBeNull();
    // A fresh starter floor, not Alice's edited one, if anyone asked for her factory again.
    expect((await settledFactory(a.id, [])).layout.belts.some((x) => x.x === 0 && x.y === 0)).toBe(false);
    await claimField(b.id, slot); // Bob can now claim it
  });

  it('exports pilot, claims and factory without the password hash', async () => {
    const a = await pilots().create({ name: 'Alice', email: 'a@example.com', passwordHash: 'scrypt:secret:hash' });
    await claimField(a.id, firstSlot());
    const data = await exportPilot(a);
    expect(data.pilot.email).toBe('a@example.com');
    expect(data.claims).toHaveLength(1);
    expect(data.factory.layout.machines.length).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toContain('scrypt');
    expect(JSON.stringify(data)).not.toContain('passwordHash');
  });
});

describe('purging idle test pilots', () => {
  it('deletes idle test pilots only, with their claims', async () => {
    const store = pilots() as MemoryPilotStore;
    const now = Date.now();
    const old = await store.create({ name: 'Old Test', isTest: true });
    const fresh = await store.create({ name: 'New Test', isTest: true });
    const real = await store.create({ name: 'Real', email: 'r@example.com', passwordHash: 'scrypt:x:y' });
    await claimField(old.id, firstSlot());
    const longAgo = new Date(now - 8 * 86_400_000).toISOString();
    store.pilots.get(old.id)!.lastSeenAt = longAgo;
    store.pilots.get(real.id)!.lastSeenAt = longAgo;

    expect(await purgeIdleTestPilots(now)).toEqual([old.id]);
    expect(await pilots().byId(old.id)).toBeNull();
    expect(await pilotClaims(old.id)).toEqual([]);
    expect(await pilots().byId(fresh.id)).not.toBeNull();
    expect(await pilots().byId(real.id)).not.toBeNull();
  });

  it('reads the retention period from the environment', () => {
    expect(testPilotRetentionDays({})).toBe(7);
    expect(testPilotRetentionDays({ TEST_PILOT_RETENTION_DAYS: '3' })).toBe(3);
    expect(testPilotRetentionDays({ TEST_PILOT_RETENTION_DAYS: 'junk' })).toBe(7);
  });
});
