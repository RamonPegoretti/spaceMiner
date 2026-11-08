import { describe, expect, it } from 'vitest';
import { fieldPosition, fieldSpawn, generateGalaxy, MAP_H, MAP_W } from './galaxy';

describe('galaxy generator', () => {
  const g = generateGalaxy();

  it('is the same every time', () => {
    expect(JSON.stringify(generateGalaxy().systems)).toBe(JSON.stringify(g.systems));
  });

  it('has 12 systems, home first, all on the map', () => {
    expect(g.systems).toHaveLength(12);
    expect(g.systems[0].name).toBe("Vasko's Reach");
    for (const s of g.systems) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(MAP_W);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(MAP_H);
    }
    expect(new Set(g.systems.map((s) => s.name)).size).toBe(12);
  });

  it('connects every system by lanes', () => {
    const seen = new Set(['s0']);
    const queue = ['s0'];
    while (queue.length) for (const n of g.byId.get(queue.shift()!)!.links) if (!seen.has(n)) seen.add(n), queue.push(n);
    expect(seen.size).toBe(12);
  });

  it('gives every system 3 or 4 fields and a gate per lane', () => {
    for (const s of g.systems) {
      expect(s.slots.length).toBeGreaterThanOrEqual(3);
      expect(s.slots.length).toBeLessThanOrEqual(4);
      expect(s.stations.filter((st) => st.kind === 'gate')).toHaveLength(s.links.length);
    }
  });

  it('keeps fields on the system map as they drift', () => {
    for (const s of g.systems)
      for (const slot of s.slots)
        for (const t of [0, 3.6e6, 4e7, 9e8]) {
          const p = fieldPosition(s, slot, fieldSpawn(slot, 0), t);
          expect(p.x).toBeGreaterThan(20);
          expect(p.x).toBeLessThan(MAP_W - 20);
          expect(p.y).toBeGreaterThan(20);
          expect(p.y).toBeLessThan(MAP_H - 20);
        }
  });

  it('rolls a new field on respawn', () => {
    const slot = g.systems[0].slots[0];
    const a = fieldSpawn(slot, 0), b = fieldSpawn(slot, 1);
    expect(a).toEqual(fieldSpawn(slot, 0));
    expect(a.name === b.name && a.initial === b.initial).toBe(false);
    expect(a.initial).toBeGreaterThanOrEqual(8_000);
    expect(a.initial).toBeLessThanOrEqual(40_000);
  });
});
