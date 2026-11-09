import { describe, expect, it } from 'vitest';
import { applyOp, connections, emptySim, FloorError, parseFactoryOp, simulate, starterLayout, warehouseUsed, type Layout } from './factory';
import { MACHINES, WAREHOUSE_CAPACITY, type Ore } from './resources';

/** A silo that has `perMin` of every ore mined per minute, starting with `start`. */
const silo = (perMin: number, start = 0) => (_ore: Ore, minute: number) => start + perMin * minute;

describe('factory floor', () => {
  it('links the starter line intake -> smelter -> crate', () => {
    const { edges } = connections(starterLayout());
    expect(edges.get('m1')).toEqual(['m2']);
    expect(edges.get('m2')).toEqual(['m3']);
    expect(edges.get('m3')).toEqual([]);
  });

  it('a belt pointing into a machine does not take its output', () => {
    const l = starterLayout();
    // Reverse the first belt so it points back into the intake.
    l.belts[0].dir = 2;
    expect(connections(l).edges.get('m1')).toEqual([]);
  });

  it('turns iron ore into plates at the smelter speed', () => {
    const sim = simulate(starterLayout(), emptySim(), 60, silo(100, 1000));
    // Smelter makes 10 plates/min from 20 ore/min. Over an hour, minus a moment to fill the line.
    expect(sim.warehouse.ironPlate).toBeGreaterThan(580);
    expect(sim.warehouse.ironPlate).toBeLessThanOrEqual(600);
    expect(sim.machines.m2.status).toBe('working');
    expect(sim.machines.m2.rate).toBeCloseTo(10);
  });

  it('is limited by ore actually mined', () => {
    const sim = simulate(starterLayout(), emptySim(), 120, silo(4));
    // 4 ore/min mined makes at most 2 plates/min.
    expect(sim.warehouse.ironPlate).toBeLessThanOrEqual(240);
    expect(sim.warehouse.ironPlate).toBeGreaterThan(220);
    expect(sim.oreUsed.iron).toBeLessThanOrEqual(480);
  });

  it('starves with no ore', () => {
    const sim = simulate(starterLayout(), emptySim(), 30, silo(0));
    expect(sim.warehouse.ironPlate ?? 0).toBe(0);
    expect(sim.machines.m1.status).toBe('starved');
  });

  it('gives the same totals offline in one long step as in many short ones', () => {
    const once = simulate(starterLayout(), emptySim(), 600, silo(100, 1000));
    let s = emptySim();
    for (let i = 0; i < 60; i++) s = simulate(starterLayout(), s, 10, (o, m) => silo(100, 1000)(o, i * 10 + m));
    expect(s.warehouse.ironPlate!).toBeCloseTo(once.warehouse.ironPlate!, 0);
  });

  it('stops at the warehouse limit and backs up', () => {
    const full = { ...emptySim(), warehouse: { frame: WAREHOUSE_CAPACITY - 5 } };
    const sim = simulate(starterLayout(), full, 60, silo(100, 1000));
    expect(warehouseUsed(sim)).toBeCloseTo(WAREHOUSE_CAPACITY);
    expect(sim.machines.m2.status).toBe('blocked');
  });

  it('runs a two-input assembler line', () => {
    // Iron and nickel smelters feeding an assembler that makes frames.
    let l: Layout = { machines: [], belts: [], nextId: 1 };
    const place = (kind: 'intake' | 'smelter' | 'assembler' | 'crate', x: number, y: number) => (l = applyOp(l, { op: 'place', kind, x, y }).layout);
    place('intake', 0, 0); // m1 iron
    place('smelter', 3, 0); // m2 ironPlate
    place('intake', 0, 4); // m3
    place('smelter', 3, 4); // m4
    place('assembler', 8, 2); // m5 frame
    place('crate', 12, 3); // m6
    l = applyOp(l, { op: 'recipe', id: 'm3', recipe: 'pull-nickel' }).layout;
    l = applyOp(l, { op: 'recipe', id: 'm4', recipe: 'nickelBar' }).layout;
    l = applyOp(l, { op: 'belts', belts: [{ x: 2, y: 1, dir: 0 }, { x: 2, y: 5, dir: 0 }, { x: 5, y: 1, dir: 0 }, { x: 6, y: 1, dir: 0 }, { x: 7, y: 1, dir: 1 }, { x: 7, y: 2, dir: 0 }, { x: 5, y: 5, dir: 0 }, { x: 6, y: 5, dir: 0 }, { x: 7, y: 5, dir: 3 }, { x: 7, y: 4, dir: 3 }, { x: 7, y: 3, dir: 0 }, { x: 11, y: 3, dir: 0 }] }).layout;
    const { edges } = connections(l);
    expect(edges.get('m2')).toEqual(['m5']);
    expect(edges.get('m4')).toEqual(['m5']);
    expect(edges.get('m5')).toEqual(['m6']);
    const sim = simulate(l, emptySim(), 120, silo(100, 1000));
    // Frames need 2 plates + 1 bar, 4 per minute max.
    expect(sim.machines.m5.rate).toBeCloseTo(4);
    expect(sim.warehouse.frame).toBeGreaterThan(450);
  });

  it('charges for building and refunds half on removal', () => {
    const { layout, cost } = applyOp(starterLayout(), { op: 'place', kind: 'smelter', x: 12, y: 7 });
    expect(cost).toBe(MACHINES.smelter.cost);
    expect(applyOp(layout, { op: 'remove', x: 13, y: 8 }).cost).toBe(-MACHINES.smelter.cost / 2);
  });

  it('refuses overlapping or off-grid machines', () => {
    expect(() => applyOp(starterLayout(), { op: 'place', kind: 'smelter', x: 3, y: 3 })).toThrow(FloorError);
    expect(() => applyOp(starterLayout(), { op: 'place', kind: 'assembler', x: 14, y: 0 })).toThrow(FloorError);
  });
});

describe('validating factory edits', () => {
  it('accepts well-formed edits and copies only known fields', () => {
    expect(parseFactoryOp({ op: 'place', kind: 'smelter', x: 1, y: 2, extra: 'x' })).toEqual({ op: 'place', kind: 'smelter', x: 1, y: 2 });
    expect(parseFactoryOp({ op: 'belts', belts: [{ x: 1, y: 1, dir: 3, free: true }] })).toEqual({ op: 'belts', belts: [{ x: 1, y: 1, dir: 3 }] });
    expect(parseFactoryOp({ op: 'remove', x: 0, y: 0 })).toEqual({ op: 'remove', x: 0, y: 0 });
    expect(parseFactoryOp({ op: 'recipe', id: 'm2', recipe: 'ironPlate' })).toEqual({ op: 'recipe', id: 'm2', recipe: 'ironPlate' });
  });

  it.each([
    ['inherited kind "constructor"', { op: 'place', kind: 'constructor', x: 1, y: 1 }],
    ['kind "__proto__"', { op: 'place', kind: '__proto__', x: 1, y: 1 }],
    ['kind "toString"', { op: 'place', kind: 'toString', x: 1, y: 1 }],
    ['x as a string', { op: 'place', kind: 'smelter', x: '1', y: 1 }],
    ['x as a fraction', { op: 'place', kind: 'smelter', x: 1.5, y: 1 }],
    ['a null belt', { op: 'belts', belts: [null] }],
    ['a belt with a bad direction', { op: 'belts', belts: [{ x: 1, y: 1, dir: 4 }] }],
    ['too many belts', { op: 'belts', belts: Array.from({ length: 65 }, (_, i) => ({ x: i % 16, y: 0, dir: 0 })) }],
    ['an unknown recipe', { op: 'recipe', id: 'm2', recipe: 'constructor' }],
    ['an unknown op', { op: 'nuke' }],
    ['not an object', 'place'],
    ['null', null],
    ['an array', [{ op: 'remove', x: 0, y: 0 }]],
  ])('rejects %s', (_label, v) => {
    expect(parseFactoryOp(v)).toBeNull();
  });

  it('applyOp refuses inherited machine kinds too', () => {
    expect(() => applyOp(starterLayout(), { op: 'place', kind: 'constructor' as never, x: 0, y: 0 })).toThrow(FloorError);
  });
});

describe('starter pieces', () => {
  it('refund nothing when removed', () => {
    const l = starterLayout();
    expect(applyOp(l, { op: 'remove', x: 7, y: 3 }).cost).toBe(0); // smelter
    expect(applyOp(l, { op: 'remove', x: 4, y: 4 }).cost).toBe(0); // belt
  });

  it('are recognised on floors saved before the free flag', () => {
    const l = starterLayout();
    for (const m of l.machines) delete m.free;
    expect(applyOp(l, { op: 'remove', x: 7, y: 3 }).cost).toBe(0);
  });

  it('stay free when a belt is re-pointed', () => {
    const { layout } = applyOp(starterLayout(), { op: 'belts', belts: [{ x: 4, y: 4, dir: 1 }] });
    expect(applyOp(layout, { op: 'remove', x: 4, y: 4 }).cost).toBe(0);
  });

  it('bought pieces still refund half', () => {
    const placed = applyOp(starterLayout(), { op: 'place', kind: 'smelter', x: 0, y: 7 }).layout;
    expect(applyOp(placed, { op: 'remove', x: 0, y: 7 }).cost).toBe(-Math.floor(MACHINES.smelter.cost / 2));
    const belted = applyOp(starterLayout(), { op: 'belts', belts: [{ x: 0, y: 0, dir: 0 }] }).layout;
    expect(applyOp(belted, { op: 'remove', x: 0, y: 0 }).cost).toBeLessThan(0);
  });
});
