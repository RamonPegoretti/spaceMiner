import { BELT_COST, MACHINES, ORES, RECIPE_BY_ID, REFUND, WAREHOUSE_CAPACITY, type Item, type MachineKind, type Ore, type Recipe } from './resources';

/**
 * Factory floors: a grid where pilots place machines and conveyor belts by hand.
 * The layout is plain data; `simulate` runs it forward over any stretch of time,
 * so a factory keeps working while its owner is offline.
 */
export const GRID_W = 16;
export const GRID_H = 10;

/** Belt directions: 0 east, 1 south, 2 west, 3 north. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [1, 0, -1, 0] as const;
export const DY = [0, 1, 0, -1] as const;

export interface Machine {
  id: string;
  kind: MachineKind;
  x: number;
  y: number;
  /** Recipe id. Crates have none. */
  recipe: string | null;
}
export interface Belt {
  x: number;
  y: number;
  dir: Dir;
}
export interface Layout {
  machines: Machine[];
  belts: Belt[];
  nextId: number;
}

export type Status = 'working' | 'starved' | 'blocked' | 'idle';

export interface MachineState {
  /** Items waiting to be used. */
  in: Partial<Record<Item, number>>;
  /** Finished output waiting for a belt to take it. */
  out: number;
  /** Crafts per minute during the last simulated step. */
  rate: number;
  status: Status;
}

export interface Sim {
  machines: Record<string, MachineState>;
  /** Refined goods and components in your warehouse. */
  warehouse: Partial<Record<Item, number>>;
  /** Ore the factory has taken from your silo (net of ore sent back by crates). */
  oreUsed: Partial<Record<Ore, number>>;
}

export const emptySim = (): Sim => ({ machines: {}, warehouse: {}, oreUsed: {} });

/** A new pilot's floor: a ready-made iron line (intake, smelter, crate) to learn from. */
export function starterLayout(): Layout {
  const belts: Belt[] = [];
  for (let x = 4; x <= 6; x++) belts.push({ x, y: 4, dir: 0 });
  for (let x = 9; x <= 10; x++) belts.push({ x, y: 4, dir: 0 });
  return {
    machines: [
      { id: 'm1', kind: 'intake', x: 2, y: 3, recipe: 'pull-iron' },
      { id: 'm2', kind: 'smelter', x: 7, y: 3, recipe: 'ironPlate' },
      { id: 'm3', kind: 'crate', x: 11, y: 4, recipe: null },
    ],
    belts,
    nextId: 4,
  };
}

export const recipeOf = (m: Machine): Recipe | null => (m.recipe ? (RECIPE_BY_ID.get(m.recipe) ?? null) : null);
export const recipesFor = (kind: MachineKind) => [...RECIPE_BY_ID.values()].filter((r) => r.machine === kind);
const defaultRecipe = (kind: MachineKind) => recipesFor(kind)[0]?.id ?? null;

const key = (x: number, y: number) => `${x},${y}`;

/** Which machine covers each tile. */
export function tileMap(layout: Layout) {
  const tiles = new Map<string, Machine>();
  for (const m of layout.machines) {
    const { w, h } = MACHINES[m.kind];
    for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) tiles.set(key(m.x + dx, m.y + dy), m);
  }
  return tiles;
}

/**
 * Where each machine's output goes. A belt next to a machine (and not pointing into it)
 * picks up its output and carries it, tile by tile, to the machine at the end of the line.
 */
export function connections(layout: Layout) {
  const tiles = tileMap(layout);
  const belts = new Map(layout.belts.map((b) => [key(b.x, b.y), b]));
  const edges = new Map<string, string[]>();
  /** Belt tiles on a working line, with the machine feeding them. */
  const carried = new Map<string, string>();

  for (const m of layout.machines) {
    const { w, h } = MACHINES[m.kind];
    const targets: string[] = [];
    const around: [number, number][] = [];
    for (let dx = 0; dx < w; dx++) around.push([m.x + dx, m.y - 1], [m.x + dx, m.y + h]);
    for (let dy = 0; dy < h; dy++) around.push([m.x - 1, m.y + dy], [m.x + w, m.y + dy]);
    for (const [ax, ay] of around) {
      const b = belts.get(key(ax, ay));
      if (!b || tiles.get(key(ax + DX[b.dir], ay + DY[b.dir])) === m) continue;
      const path: string[] = [];
      let cur: Belt | undefined = b;
      const seen = new Set<string>();
      while (cur && !seen.has(key(cur.x, cur.y))) {
        seen.add(key(cur.x, cur.y));
        path.push(key(cur.x, cur.y));
        const nx = cur.x + DX[cur.dir], ny = cur.y + DY[cur.dir];
        const hit = tiles.get(key(nx, ny));
        if (hit) {
          if (hit !== m && !targets.includes(hit.id)) {
            targets.push(hit.id);
            for (const p of path) if (!carried.has(p)) carried.set(p, m.id);
          }
          break;
        }
        cur = belts.get(key(nx, ny));
      }
    }
    edges.set(m.id, targets);
  }
  return { edges, carried };
}

/** Machines in the order items flow, so goods can cross the whole line in one step. */
function flowOrder(layout: Layout, edges: Map<string, string[]>) {
  const indeg = new Map(layout.machines.map((m) => [m.id, 0]));
  for (const ts of edges.values()) for (const t of ts) indeg.set(t, (indeg.get(t) ?? 0) + 1);
  const queue = layout.machines.filter((m) => indeg.get(m.id) === 0).map((m) => m.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const t of edges.get(id) ?? []) {
      indeg.set(t, indeg.get(t)! - 1);
      if (indeg.get(t) === 0) queue.push(t);
    }
  }
  // Machines in a loop still run, in placement order.
  for (const m of layout.machines) if (!order.includes(m.id)) order.push(m.id);
  return order;
}

export const warehouseUsed = (sim: Sim) =>
  Object.entries(sim.warehouse).reduce((s, [item, n]) => s + ((ORES as readonly string[]).includes(item) ? 0 : (n ?? 0)), 0);

/**
 * Runs the factory for `minutes`. `oreAvailable(t)` says how much of an ore the pilot
 * has mined in total by minute t of the step (the silo), and the factory takes from it.
 * Returns a new Sim; the input is not changed.
 */
export function simulate(layout: Layout, start: Sim, minutes: number, minedBy: (ore: Ore, minute: number) => number, maxSteps = 10_080): Sim {
  const sim: Sim = structuredClone(start);
  for (const m of layout.machines) sim.machines[m.id] ??= { in: {}, out: 0, rate: 0, status: 'idle' };
  for (const id of Object.keys(sim.machines)) if (!layout.machines.some((m) => m.id === id)) delete sim.machines[id];
  if (minutes <= 0) return sim;

  const { edges } = connections(layout);
  const order = flowOrder(layout, edges).map((id) => layout.machines.find((m) => m.id === id)!);
  const steps = Math.min(maxSteps, Math.ceil(minutes));
  const dt = minutes / steps;

  for (let s = 1; s <= steps; s++) {
    const t = s * dt;
    for (const m of order) {
      const st = sim.machines[m.id];
      const r = recipeOf(m);
      if (m.kind === 'crate') {
        // Everything that arrived goes to the warehouse (ore back to the silo).
        for (const [item, n] of Object.entries(st.in) as [Item, number][]) {
          if ((ORES as readonly string[]).includes(item)) sim.oreUsed[item as Ore] = (sim.oreUsed[item as Ore] ?? 0) - n;
          else sim.warehouse[item] = (sim.warehouse[item] ?? 0) + n;
        }
        const moved = Object.values(st.in).reduce((a, b) => a + (b ?? 0), 0);
        st.in = {};
        st.rate = moved / dt;
        st.status = moved > 0 ? 'working' : 'idle';
        continue;
      }
      if (!r) {
        st.rate = 0;
        st.status = 'idle';
        continue;
      }
      const outCap = r.perMin * 2 * dt;
      let crafts = Math.min(r.perMin * dt, Math.max(0, outCap - st.out));
      const blocked = crafts <= 1e-9;
      if (m.kind === 'intake') {
        const ore = r.output as Ore;
        const silo = minedBy(ore, t) - (sim.oreUsed[ore] ?? 0);
        crafts = Math.min(crafts, Math.max(0, silo));
        sim.oreUsed[ore] = (sim.oreUsed[ore] ?? 0) + crafts;
      } else {
        for (const [item, need] of Object.entries(r.inputs) as [Item, number][]) crafts = Math.min(crafts, (st.in[item] ?? 0) / need);
        for (const [item, need] of Object.entries(r.inputs) as [Item, number][]) st.in[item] = (st.in[item] ?? 0) - crafts * need;
      }
      st.out += crafts;
      st.rate = crafts / dt;
      st.status = crafts > 1e-9 ? 'working' : blocked ? 'blocked' : 'starved';

      // Hand finished goods to the machines down the line that can use them.
      for (const tid of edges.get(m.id) ?? []) {
        if (st.out <= 1e-9) break;
        const target = layout.machines.find((x) => x.id === tid)!;
        const ts = sim.machines[tid];
        let room = 0;
        if (target.kind === 'crate') {
          const isOre = (ORES as readonly string[]).includes(r.output);
          const pending = Object.values(ts.in).reduce((a, b) => a + (b ?? 0), 0);
          room = isOre ? Infinity : WAREHOUSE_CAPACITY - warehouseUsed(sim) - pending;
        } else {
          const tr = recipeOf(target);
          const need = tr?.inputs[r.output];
          if (need) room = need * tr!.perMin * 2 * dt - (ts.in[r.output] ?? 0);
        }
        const give = Math.max(0, Math.min(room, st.out));
        if (give > 0) {
          ts.in[r.output] = (ts.in[r.output] ?? 0) + give;
          st.out -= give;
        }
      }
    }
  }
  return sim;
}

// ---- Editing the floor -------------------------------------------------------

export type FactoryOp =
  | { op: 'place'; kind: MachineKind; x: number; y: number }
  | { op: 'belts'; belts: Belt[] }
  | { op: 'remove'; x: number; y: number }
  | { op: 'recipe'; id: string; recipe: string };

export class FloorError extends Error {}

const inGrid = (x: number, y: number) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;

/** Applies one edit. Returns the new layout and its cost in credits (negative for a refund). */
export function applyOp(layout: Layout, op: FactoryOp): { layout: Layout; cost: number } {
  const next: Layout = structuredClone(layout);
  const tiles = tileMap(layout);
  const beltAt = (x: number, y: number) => next.belts.findIndex((b) => b.x === x && b.y === y);

  switch (op.op) {
    case 'place': {
      const spec = MACHINES[op.kind];
      if (!spec) throw new FloorError('Unknown machine.');
      for (let dx = 0; dx < spec.w; dx++)
        for (let dy = 0; dy < spec.h; dy++) {
          const x = op.x + dx, y = op.y + dy;
          if (!inGrid(x, y)) throw new FloorError('It does not fit there.');
          if (tiles.has(key(x, y)) || beltAt(x, y) >= 0) throw new FloorError('That spot is taken.');
        }
      next.machines.push({ id: `m${next.nextId++}`, kind: op.kind, x: op.x, y: op.y, recipe: defaultRecipe(op.kind) });
      return { layout: next, cost: spec.cost };
    }
    case 'belts': {
      if (!Array.isArray(op.belts) || op.belts.length === 0 || op.belts.length > 64) throw new FloorError('Lay 1 to 64 belts at a time.');
      let cost = 0;
      for (const b of op.belts) {
        if (!inGrid(b.x, b.y) || ![0, 1, 2, 3].includes(b.dir)) throw new FloorError('A belt is off the floor.');
        if (tiles.has(key(b.x, b.y))) continue; // skip tiles under machines
        const i = beltAt(b.x, b.y);
        if (i >= 0) next.belts[i] = { x: b.x, y: b.y, dir: b.dir };
        else {
          next.belts.push({ x: b.x, y: b.y, dir: b.dir });
          cost += BELT_COST;
        }
      }
      return { layout: next, cost };
    }
    case 'remove': {
      const m = tiles.get(key(op.x, op.y));
      if (m) {
        next.machines = next.machines.filter((x) => x.id !== m.id);
        return { layout: next, cost: -Math.floor(MACHINES[m.kind].cost * REFUND) };
      }
      const i = beltAt(op.x, op.y);
      if (i < 0) throw new FloorError('Nothing to remove there.');
      next.belts.splice(i, 1);
      return { layout: next, cost: -Math.floor(BELT_COST * REFUND) };
    }
    case 'recipe': {
      const m = next.machines.find((x) => x.id === op.id);
      const r = RECIPE_BY_ID.get(op.recipe);
      if (!m || !r || r.machine !== m.kind) throw new FloorError('That machine cannot make this.');
      m.recipe = r.id;
      return { layout: next, cost: 0 };
    }
    default:
      throw new FloorError('Unknown edit.');
  }
}

/** Machines lose what they held when they change recipe or are removed. */
export function pruneSim(layout: Layout, prev: Layout, sim: Sim): Sim {
  const next = structuredClone(sim);
  for (const id of Object.keys(next.machines)) {
    const a = layout.machines.find((m) => m.id === id), b = prev.machines.find((m) => m.id === id);
    if (!a || !b || a.recipe !== b.recipe) delete next.machines[id];
  }
  return next;
}

/** Checks a layout read back from storage or sent by a client. */
export function isLayout(v: unknown): v is Layout {
  const l = v as Layout;
  return !!l && Array.isArray(l.machines) && Array.isArray(l.belts) && typeof l.nextId === 'number';
}

