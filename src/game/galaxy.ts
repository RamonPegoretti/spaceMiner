import { ORES, type Ore } from './resources';

/**
 * The shared galaxy. It is generated from a fixed seed, so server and client build
 * the exact same map without sending it over the network. Only what changes
 * (claims, depletion) lives in the database.
 *
 * Coordinates: the galaxy map and every system map are 480 x 300 map pixels.
 */
export const MAP_W = 480;
export const MAP_H = 300;
export const GALAXY_SEED = 'spaceminer-alpha-1';

export type StationKind = 'foundry' | 'junction' | 'gate';

export interface Station {
  id: string;
  name: string;
  kind: StationKind;
  x: number;
  y: number;
  /** For gates: the system on the other side. */
  to?: string;
}

/** A place in a system where an asteroid field lives. Fields respawn in the same slot. */
export interface FieldSlot {
  id: string;
  systemId: string;
  /** Orbit radius across (x). The orbit is an ellipse, squashed by ORBIT_TILT. */
  orbit: number;
  /** Minutes for one full orbit. */
  period: number;
  /** Starting angle in radians. */
  phase: number;
}

export interface GalaxySystem {
  id: string;
  name: string;
  /** Position on the galaxy map. */
  x: number;
  y: number;
  /** Star color for the galaxy map. */
  star: number;
  sun: { x: number; y: number };
  stations: Station[];
  slots: FieldSlot[];
  links: string[];
}

export interface Galaxy {
  systems: GalaxySystem[];
  lanes: [string, string][];
  byId: Map<string, GalaxySystem>;
  slotById: Map<string, FieldSlot>;
}

export const ORBITS = [62, 104, 146, 186];
export const ORBIT_TILT = 0.58;

/** Seeded random numbers: the same seed always gives the same sequence. */
export function rng(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const SYL_A = ['Vor', 'Kel', 'Ash', 'Tor', 'Mir', 'Dun', 'Ral', 'Sev', 'Ost', 'Bri', 'Cal', 'Yan', 'Hex', 'Lum', 'Nar', 'Pell', 'Quor', 'Zan'];
const SYL_B = ['ani', 'eth', 'oro', 'ix', 'una', 'ell', 'ar', 'ova', 'is', 'um', 'ade', 'ek'];
const SYS_SUFFIX = ['Reach', 'Hold', 'Expanse', 'Verge', 'Deep', 'Crossing', 'Haven', 'Rim', 'Gap', 'Spur'];
const FIELD_SUFFIX = ['Belt', 'Drift', 'Cluster', 'Scatter', 'Shoal', 'Field', 'Ring', 'Tumble'];
const STAR_COLORS = [0xffcc33, 0xff9a3a, 0xfff2c0, 0x9ad8ff, 0xff6a4a];

const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
const word = (r: () => number) => pick(r, SYL_A) + pick(r, SYL_B);
/** Fisher-Yates shuffle. Never sort with a random comparator: engines call it differently, and the map must be identical everywhere. */
function shuffle<T>(r: () => number, list: readonly T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SYSTEM_COUNT = 12;

export function generateGalaxy(seed = GALAXY_SEED): Galaxy {
  const r = rng(seed);

  // Spread systems over the map with a minimum gap. The home system sits near the middle.
  const pts: { x: number; y: number }[] = [{ x: 240, y: 150 }];
  for (let tries = 0; pts.length < SYSTEM_COUNT && tries < 5000; tries++) {
    const p = { x: 36 + r() * (MAP_W - 72), y: 34 + r() * (MAP_H - 68) };
    if (pts.every((q) => Math.hypot(p.x - q.x, (p.y - q.y) * 1.3) > 92)) pts.push({ x: Math.round(p.x), y: Math.round(p.y) });
  }

  const used = new Set<string>();
  const systems: GalaxySystem[] = pts.map((p, i) => {
    let name = "Vasko's Reach";
    if (i > 0) {
      do name = `${word(r)} ${pick(r, SYS_SUFFIX)}`;
      while (used.has(name));
    }
    used.add(name);
    return { id: `s${i}`, name, x: p.x, y: p.y, star: i === 0 ? 0xffcc33 : pick(r, STAR_COLORS), sun: { x: 240, y: 150 }, stations: [], slots: [], links: [] };
  });

  // Lanes: a minimum spanning tree so every system is reachable, plus a few shortcuts.
  const lanes: [string, string][] = [];
  const dist = (a: GalaxySystem, b: GalaxySystem) => Math.hypot(a.x - b.x, a.y - b.y);
  const inTree = new Set([0]);
  while (inTree.size < systems.length) {
    let best: [number, number] | null = null;
    for (const i of inTree)
      for (let j = 0; j < systems.length; j++)
        if (!inTree.has(j) && (!best || dist(systems[i], systems[j]) < dist(systems[best[0]], systems[best[1]]))) best = [i, j];
    inTree.add(best![1]);
    lanes.push([systems[best![0]].id, systems[best![1]].id]);
  }
  const linked = (a: string, b: string) => lanes.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
  for (const s of systems) {
    if (r() > 0.4) continue;
    const near = systems.filter((o) => o !== s && !linked(s.id, o.id)).sort((a, b) => dist(s, a) - dist(s, b))[0];
    if (near && dist(s, near) < 170) lanes.push([s.id, near.id]);
  }
  for (const [a, b] of lanes) {
    systems.find((s) => s.id === a)!.links.push(b);
    systems.find((s) => s.id === b)!.links.push(a);
  }

  // Inside each system: a station, a gate toward every linked system, and 3 to 4 field slots.
  for (const [i, s] of systems.entries()) {
    const sr = rng(`${seed}/${s.id}`);
    const stAng = sr() * Math.PI * 2;
    s.stations.push({
      id: `${s.id}-station`,
      name: i === 0 ? 'Home Foundry' : `${word(sr)} Junction`,
      kind: i === 0 ? 'foundry' : 'junction',
      x: Math.round(s.sun.x + Math.cos(stAng) * 38),
      y: Math.round(s.sun.y + Math.sin(stAng) * 38 * ORBIT_TILT),
    });
    for (const to of s.links) {
      const o = systems.find((q) => q.id === to)!;
      const ang = Math.atan2(o.y - s.y, o.x - s.x);
      s.stations.push({
        id: `${s.id}-gate-${to}`,
        name: `Gate to ${o.name}`,
        kind: 'gate',
        to,
        x: Math.round(s.sun.x + Math.cos(ang) * 214),
        y: Math.round(s.sun.y + Math.sin(ang) * 126),
      });
    }
    const count = i === 0 ? 4 : 3 + Math.floor(sr() * 2);
    const orbits = shuffle(sr, ORBITS).slice(0, count).sort((a, b) => a - b);
    orbits.forEach((orbit, n) => {
      s.slots.push({
        id: `${s.id}-f${n}`,
        systemId: s.id,
        orbit,
        // Outer orbits are slower: 6 to 18 hours for a full lap, so fields visibly drift over a day.
        period: Math.round((360 + orbit * 3 + sr() * 240) * (sr() < 0.5 ? 1 : -1)),
        phase: sr() * Math.PI * 2,
      });
    });
  }

  return {
    systems,
    lanes,
    byId: new Map(systems.map((s) => [s.id, s])),
    slotById: new Map(systems.flatMap((s) => s.slots.map((f) => [f.id, f] as const))),
  };
}

/** What sits in a slot for one generation: each respawn rolls a new field. */
export interface FieldSpawn {
  name: string;
  ore: Ore;
  /** Tonnes of ore when it spawns. */
  initial: number;
  /** Extra angle so a respawned field shows up somewhere else on its orbit. */
  phaseShift: number;
}

export function fieldSpawn(slot: FieldSlot, generation: number): FieldSpawn {
  const r = rng(`${slot.id}#${generation}`);
  return {
    name: `${word(r)} ${pick(r, FIELD_SUFFIX)}`,
    ore: ORES[Math.floor(r() * ORES.length)],
    initial: Math.round((8_000 + r() * 32_000) / 100) * 100,
    phaseShift: generation === 0 ? 0 : r() * Math.PI * 2,
  };
}

/** Where a field is on its system map at a moment in time (ms). Fields slowly orbit the sun. */
export function fieldPosition(sys: GalaxySystem, slot: FieldSlot, spawn: FieldSpawn, now: number) {
  const ang = slot.phase + spawn.phaseShift + (2 * Math.PI * (now / 60_000)) / slot.period;
  return { x: sys.sun.x + Math.cos(ang) * slot.orbit, y: sys.sun.y + Math.sin(ang) * slot.orbit * ORBIT_TILT };
}

let cached: Galaxy | null = null;
/** The live galaxy. */
export function galaxy(): Galaxy {
  cached ??= generateGalaxy();
  return cached;
}
