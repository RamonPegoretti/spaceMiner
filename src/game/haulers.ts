import { mined, type ClaimRec } from './claims';
import { galaxy } from './galaxy';
import { ORES, type Ore } from './resources';

/**
 * Logistics. Ore mined in Vasko's Reach goes straight into your silo at the Home Foundry.
 * Ore mined anywhere else piles up in that system until a hauler brings it home.
 *
 * A hauler flies a fixed route: the systems you linked on the map, lane by lane,
 * ending at home. It shuttles forever: load, fly home, unload, fly back. Everything
 * here is worked out from timestamps, like mining and factories.
 */
export const HOME = 's0';
export const HAULER = {
  cost: 1_000,
  /** Tonnes per trip. */
  capacity: 500,
  /** Galaxy map pixels per minute. */
  speed: 12,
  /** Minutes spent loading or unloading. */
  dock: 2,
  max: 5,
  maxStops: 8,
} as const;

const MIN = 60_000;

export interface HaulerRec {
  id: string;
  pilotId: string;
  /** System ids from the pickup system to home, each linked to the next by a lane. */
  route: string[];
  createdAt: number;
  removedAt: number | null;
}

export class RouteError extends Error {}

/** Checks a route plotted on the map. */
export function checkRoute(route: unknown): string[] {
  const g = galaxy();
  if (!Array.isArray(route) || route.length < 2) throw new RouteError('Link at least two systems.');
  if (route.length > HAULER.maxStops) throw new RouteError(`A route can have at most ${HAULER.maxStops} stops.`);
  for (const id of route) if (typeof id !== 'string' || !g.byId.has(id)) throw new RouteError('That system does not exist.');
  for (let i = 1; i < route.length; i++)
    if (!g.byId.get(route[i - 1])!.links.includes(route[i])) throw new RouteError('Each stop must be linked to the next by a lane.');
  if (route[route.length - 1] !== HOME) throw new RouteError("A route has to end at Vasko's Reach, where your foundry is.");
  if (route[0] === HOME) throw new RouteError('Start the route at the system you want to haul ore from.');
  if (new Set(route).size !== route.length) throw new RouteError('A route cannot visit a system twice.');
  return route as string[];
}

export function routeLength(route: string[]) {
  const g = galaxy();
  let d = 0;
  for (let i = 1; i < route.length; i++) {
    const a = g.byId.get(route[i - 1])!, b = g.byId.get(route[i])!;
    d += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return d;
}

/** Minutes for one way, and for a full round trip including docking. */
export function tripTimes(route: string[]) {
  const oneWay = routeLength(route) / HAULER.speed;
  return { oneWay, round: 2 * oneWay + 2 * HAULER.dock };
}

export type HaulerPhase = 'loading' | 'outbound' | 'unloading' | 'returning' | 'scrapped';

/** Where a hauler is on the galaxy map at a moment. */
export function haulerPosition(h: HaulerRec, now: number) {
  const g = galaxy();
  const { oneWay, round } = tripTimes(h.route);
  const t = (Math.max(0, now - h.createdAt) / MIN) % round;
  const trip = Math.floor(Math.max(0, now - h.createdAt) / MIN / round);
  let phase: HaulerPhase, k: number; // k: 0 at the pickup end, 1 at home
  if (t < HAULER.dock) (phase = 'loading'), (k = 0);
  else if (t < HAULER.dock + oneWay) (phase = 'outbound'), (k = (t - HAULER.dock) / oneWay);
  else if (t < 2 * HAULER.dock + oneWay) (phase = 'unloading'), (k = 1);
  else (phase = 'returning'), (k = 1 - (t - 2 * HAULER.dock - oneWay) / oneWay);

  // Walk the route to the point k of the way along it.
  const pts = h.route.map((id) => g.byId.get(id)!);
  let left = k * routeLength(h.route);
  let x = pts[0].x, y = pts[0].y, angle = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    angle = Math.atan2(b.y - a.y, b.x - a.x);
    if (left <= len || i === pts.length - 1) {
      const f = len ? Math.min(1, left / len) : 0;
      x = a.x + (b.x - a.x) * f;
      y = a.y + (b.y - a.y) * f;
      break;
    }
    left -= len;
  }
  if (phase === 'returning') angle += Math.PI;
  // Minutes until it next reaches home.
  const toHome = phase === 'loading' ? HAULER.dock - t + oneWay : phase === 'outbound' ? HAULER.dock + oneWay - t : phase === 'unloading' ? 0 : round - t + HAULER.dock + oneWay;
  return { x, y, angle, phase, trip, toHome };
}

export interface Delivery {
  at: number;
  haulerId: string;
  cargo: Partial<Record<Ore, number>>;
}

export interface Logistics {
  /** Ore waiting in each system (not home) for a hauler. */
  stockpiles: Record<string, Partial<Record<Ore, { amount: number; rate: number }>>>;
  /** Cargo each hauler carries right now. */
  cargo: Record<string, Partial<Record<Ore, number>>>;
  /** Tonnes of an ore that has reached the silo by time t: mined at home plus delivered. */
  supply: (ore: Ore, t: number) => number;
  /** Mining rate into the silo right now (home claims only). */
  homeRate: Partial<Record<Ore, number>>;
}

const systemOf = (slot: string) => slot.split('-')[0];

/**
 * Plays every hauler trip from the start, in time order, so two haulers at the
 * same system share its ore fairly. Deliveries count once the hauler unloads.
 */
export function logistics(claims: ClaimRec[], pilotId: string, haulers: HaulerRec[], now: number): Logistics {
  const mine = claims.filter((c) => c.pilotId === pilotId);
  const minedAt = (system: string, ore: Ore, t: number) => mine.reduce((s, c) => (c.ore === ore && systemOf(c.slot) === system ? s + mined(c, t) : s), 0);

  type Load = { at: number; h: HaulerRec; arrive: number };
  const loads: Load[] = [];
  for (const h of haulers.filter((x) => x.pilotId === pilotId)) {
    const { oneWay, round } = tripTimes(h.route);
    const end = Math.min(now, h.removedAt ?? Infinity);
    for (let k = 0; ; k++) {
      const at = h.createdAt + (k * round + HAULER.dock) * MIN;
      if (at > end) break;
      loads.push({ at, h, arrive: at + (oneWay + HAULER.dock) * MIN });
    }
  }
  loads.sort((a, b) => a.at - b.at);

  const taken: Record<string, Partial<Record<Ore, number>>> = {};
  const deliveries: Delivery[] = [];
  const cargo: Record<string, Partial<Record<Ore, number>>> = {};
  for (const l of loads) {
    const from = l.h.route[0];
    const tk = (taken[from] ??= {});
    let room: number = HAULER.capacity;
    const load: Partial<Record<Ore, number>> = {};
    for (const ore of ORES) {
      const avail = minedAt(from, ore, l.at) - (tk[ore] ?? 0);
      const n = Math.max(0, Math.min(room, avail));
      if (n > 0) {
        load[ore] = n;
        tk[ore] = (tk[ore] ?? 0) + n;
        room -= n;
      }
    }
    deliveries.push({ at: l.arrive, haulerId: l.h.id, cargo: load });
    if (l.arrive > now) cargo[l.h.id] = load;
  }

  // Running totals of deliveries per ore, for fast lookups by time.
  deliveries.sort((a, b) => a.at - b.at);
  const times = deliveries.map((d) => d.at);
  const sums: Record<Ore, number[]> = { iron: [], nickel: [], ice: [], silicate: [] };
  for (const ore of ORES) {
    let s = 0;
    for (const d of deliveries) sums[ore].push((s += d.cargo[ore] ?? 0));
  }
  const deliveredBy = (ore: Ore, t: number) => {
    let lo = 0, hi = times.length; // first index with time > t
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo ? sums[ore][lo - 1] : 0;
  };

  const stockpiles: Logistics['stockpiles'] = {};
  const homeRate: Logistics['homeRate'] = {};
  for (const c of mine) {
    const sys = systemOf(c.slot);
    const active = c.endedAt === null && mined(c, now) < c.startRemaining;
    if (sys === HOME) {
      if (active) homeRate[c.ore] = (homeRate[c.ore] ?? 0) + c.rate;
      continue;
    }
    const pile = (stockpiles[sys] ??= {});
    const p = (pile[c.ore] ??= { amount: 0, rate: 0 });
    if (active) p.rate += c.rate;
  }
  for (const [sys, pile] of Object.entries(stockpiles))
    for (const ore of Object.keys(pile) as Ore[]) pile[ore]!.amount = Math.max(0, minedAt(sys, ore, now) - (taken[sys]?.[ore] ?? 0));

  return { stockpiles, cargo, supply: (ore, t) => minedAt(HOME, ore, t) + deliveredBy(ore, t), homeRate };
}
