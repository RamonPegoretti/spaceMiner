import { describe, expect, it } from 'vitest';
import type { ClaimRec } from './claims';
import { galaxy } from './galaxy';
import { checkRoute, HAULER, haulerPosition, HOME, logistics, RouteError, tripTimes, type HaulerRec } from './haulers';

const MIN = 60_000;
const g = galaxy();
const home = g.byId.get(HOME)!;
const near = g.byId.get(home.links[0])!; // a system one lane from home
const route = [near.id, HOME];

const claim = (slot: string, over: Partial<ClaimRec> = {}): ClaimRec => ({
  id: slot, slot, generation: 0, pilotId: 'p1', pilotName: 'Ana', ore: 'iron',
  rate: 25, startRemaining: 100_000, startedAt: 0, endedAt: null, ...over,
});
const hauler = (over: Partial<HaulerRec> = {}): HaulerRec => ({ id: 'h1', pilotId: 'p1', route, createdAt: 0, removedAt: null, ...over });

describe('routes', () => {
  it('accepts a lane-linked route that ends at home', () => {
    expect(checkRoute(route)).toEqual(route);
  });

  it('refuses routes that skip lanes, miss home or loop', () => {
    const far = g.systems.find((s) => s.id !== HOME && !home.links.includes(s.id))!;
    expect(() => checkRoute([far.id, HOME])).toThrow(RouteError);
    expect(() => checkRoute([HOME, near.id])).toThrow(RouteError);
    expect(() => checkRoute([near.id])).toThrow(RouteError);
    expect(() => checkRoute([near.id, HOME, near.id, HOME])).toThrow(RouteError);
  });

  it('flies from the pickup system to home and back', () => {
    const { oneWay, round } = tripTimes(route);
    const at = (min: number) => haulerPosition(hauler(), min * MIN);
    expect(at(1).phase).toBe('loading');
    expect(at(HAULER.dock + oneWay / 2).phase).toBe('outbound');
    const mid = at(HAULER.dock + oneWay / 2);
    expect(mid.x).toBeCloseTo((near.x + home.x) / 2, 0);
    expect(at(HAULER.dock + oneWay + 1).phase).toBe('unloading');
    expect(at(2 * HAULER.dock + oneWay * 1.5).phase).toBe('returning');
    expect(at(round + 1).trip).toBe(1);
  });
});

describe('logistics', () => {
  const remote = `${near.id}-f0`;

  it('keeps ore mined away from home in that system', () => {
    const lg = logistics([claim(remote)], 'p1', [], 60 * MIN);
    expect(lg.stockpiles[near.id]?.iron?.amount).toBe(1500);
    expect(lg.supply('iron', 60 * MIN)).toBe(0);
  });

  it('home claims go straight to the silo', () => {
    const lg = logistics([claim('s0-f0')], 'p1', [], 60 * MIN);
    expect(lg.supply('iron', 60 * MIN)).toBe(1500);
    expect(lg.homeRate.iron).toBe(25);
  });

  it('a hauler brings stockpiled ore home, up to its capacity per trip', () => {
    const { oneWay, round } = tripTimes(route);
    // Ore piled up for 100 minutes before the hauler arrived.
    const h = hauler({ createdAt: 100 * MIN });
    const firstArrive = 100 + HAULER.dock + oneWay + HAULER.dock;
    const before = logistics([claim(remote)], 'p1', [h], (firstArrive - 0.1) * MIN);
    expect(before.supply('iron', (firstArrive - 0.1) * MIN)).toBe(0);
    expect(before.cargo.h1.iron).toBe(HAULER.capacity);
    const after = logistics([claim(remote)], 'p1', [h], (firstArrive + 0.1) * MIN);
    expect(after.supply('iron', (firstArrive + 0.1) * MIN)).toBe(HAULER.capacity);
    // Nothing is created or lost: stockpile + cargo + delivered = mined.
    const t = (100 + 3 * round + 5) * MIN;
    const lg = logistics([claim(remote)], 'p1', [h], t);
    const inFlight = Object.values(lg.cargo).reduce((s, c) => s + (c.iron ?? 0), 0);
    expect(lg.stockpiles[near.id]!.iron!.amount + inFlight + lg.supply('iron', t)).toBeCloseTo(25 * (t / MIN));
  });

  it('two haulers at one system share its ore without double counting', () => {
    const t = 600 * MIN;
    const one = logistics([claim(remote)], 'p1', [hauler()], t);
    const two = logistics([claim(remote)], 'p1', [hauler(), hauler({ id: 'h2', createdAt: 7 * MIN })], t);
    const total = (lg: typeof one) => lg.stockpiles[near.id]!.iron!.amount + Object.values(lg.cargo).reduce((s, c) => s + (c.iron ?? 0), 0) + lg.supply('iron', t);
    expect(total(one)).toBeCloseTo(15_000);
    expect(total(two)).toBeCloseTo(15_000);
    expect(two.supply('iron', t)).toBeGreaterThanOrEqual(one.supply('iron', t));
  });

  it('a scrapped hauler stops loading', () => {
    const lg = logistics([claim(remote)], 'p1', [hauler({ removedAt: 1 * MIN })], 600 * MIN);
    // Scrapped before its first load finished, so it never carries anything.
    expect(lg.supply('iron', 600 * MIN)).toBe(0);
  });
});
