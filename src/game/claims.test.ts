import { describe, expect, it } from 'vitest';
import { claimDryAt, mined, pilotOre, resolveField, RESPAWN_MS, type ClaimRec } from './claims';
import { fieldSpawn, generateGalaxy } from './galaxy';

const MIN = 60_000;
const slot = generateGalaxy().systems[0].slots[0];
const spawn = fieldSpawn(slot, 0);

const claim = (over: Partial<ClaimRec> = {}): ClaimRec => ({
  id: 'c1', slot: slot.id, generation: 0, pilotId: 'p1', pilotName: 'Ana', ore: spawn.ore,
  rate: 25, startRemaining: spawn.initial, startedAt: 0, endedAt: null, ...over,
});

describe('claims', () => {
  it('mines at the claim rate and stops when abandoned', () => {
    expect(mined(claim(), 10 * MIN)).toBe(250);
    expect(mined(claim({ endedAt: 4 * MIN }), 10 * MIN)).toBe(100);
  });

  it('never mines more than the field had', () => {
    const c = claim({ startRemaining: 100 });
    expect(mined(c, 1000 * MIN)).toBe(100);
    expect(claimDryAt(c)).toBe(4 * MIN);
  });

  it('a fresh field is full and free', () => {
    const f = resolveField(slot, undefined, [], 5 * MIN);
    expect(f.remaining).toBe(spawn.initial);
    expect(f.claim).toBeNull();
    expect(f.generation).toBe(0);
  });

  it('a claimed field depletes', () => {
    const f = resolveField(slot, undefined, [claim()], 10 * MIN);
    expect(f.remaining).toBe(spawn.initial - 250);
    expect(f.claim?.pilotName).toBe('Ana');
    expect(f.rate).toBe(25);
  });

  it('a second claim continues from what the first left', () => {
    const first = claim({ endedAt: 10 * MIN });
    const second = claim({ id: 'c2', pilotId: 'p2', startedAt: 20 * MIN, startRemaining: spawn.initial - 250 });
    const f = resolveField(slot, undefined, [first, second], 30 * MIN);
    expect(f.remaining).toBe(spawn.initial - 500);
    expect(f.claim?.id).toBe('c2');
  });

  it('goes dry, then respawns as a new field an hour later', () => {
    const c = claim();
    const dry = claimDryAt(c);
    const during = resolveField(slot, undefined, [c], dry + MIN);
    expect(during.remaining).toBe(0);
    expect(during.claim).toBeNull();
    expect(during.respawnAt).toBe(dry + RESPAWN_MS);
    expect(during.stale).toEqual([{ id: 'c1', endedAt: dry }]);

    const after = resolveField(slot, undefined, [c], dry + RESPAWN_MS + MIN);
    expect(after.respawned).toBe(true);
    expect(after.generation).toBe(1);
    expect(after.remaining).toBe(fieldSpawn(slot, 1).initial);
    expect(after.claim).toBeNull();
  });

  it('sums a pilot\'s ore over claims', () => {
    const a = claim();
    const b = claim({ id: 'c2', ore: 'ice', endedAt: 2 * MIN });
    const other = claim({ id: 'c3', pilotId: 'p2' });
    const ore = pilotOre([a, b, other], 'p1', 10 * MIN);
    expect(ore[spawn.ore === 'ice' ? 'ice' : spawn.ore]?.amount).toBe(spawn.ore === 'ice' ? 300 : 250);
    expect(ore.ice?.rate).toBe(spawn.ore === 'ice' ? 25 : 0);
  });
});
