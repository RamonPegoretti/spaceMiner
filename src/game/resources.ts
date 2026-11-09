/**
 * Every resource and recipe in the game, in one place. Change numbers here to rebalance.
 * Rules in src/game are shared by server and client and have no I/O.
 */
export const ORES = ['iron', 'nickel', 'ice', 'silicate'] as const;
export type Ore = (typeof ORES)[number];

export const REFINED = ['ironPlate', 'nickelBar', 'water', 'siliconWafer'] as const;
export const COMPONENTS = ['frame', 'coolantCell', 'circuit'] as const;
export const ITEMS = [...ORES, ...REFINED, ...COMPONENTS] as const;
export type Item = (typeof ITEMS)[number];

export const ORE_INFO: Record<Ore, { name: string; sprite: string }> = {
  iron: { name: 'Iron ore', sprite: 'iron' },
  nickel: { name: 'Nickel ore', sprite: 'nickel' },
  ice: { name: 'Water ice', sprite: 'ice' },
  silicate: { name: 'Silicate', sprite: 'sil' },
};

export const ITEM_INFO: Record<Item, { name: string; short: string; color: string }> = {
  iron: { name: 'Iron ore', short: 'IRON', color: '#d9773f' },
  nickel: { name: 'Nickel ore', short: 'NICKEL', color: '#e8e2d0' },
  ice: { name: 'Water ice', short: 'ICE', color: '#7fd6f2' },
  silicate: { name: 'Silicate', short: 'SILICATE', color: '#a77ff2' },
  ironPlate: { name: 'Iron plate', short: 'PLATE', color: '#c9b8a8' },
  nickelBar: { name: 'Nickel bar', short: 'BAR', color: '#f3eadf' },
  water: { name: 'Water', short: 'WATER', color: '#4fb6ff' },
  siliconWafer: { name: 'Silicon wafer', short: 'WAFER', color: '#8a7cff' },
  frame: { name: 'Frame', short: 'FRAME', color: '#ffcc33' },
  coolantCell: { name: 'Coolant cell', short: 'COOLANT', color: '#6fe08a' },
  circuit: { name: 'Circuit', short: 'CIRCUIT', color: '#ff7a2e' },
};

export type MachineKind = 'intake' | 'smelter' | 'assembler' | 'crate';

export interface Recipe {
  id: string;
  machine: MachineKind;
  /** Inputs used per craft. An intake has none: it pulls ore from your ore silo. */
  inputs: Partial<Record<Item, number>>;
  output: Item;
  /** Crafts per minute at full speed. */
  perMin: number;
}

export const RECIPES: Recipe[] = [
  // Intakes feed mined ore from your silo onto the floor.
  ...ORES.map((ore): Recipe => ({ id: `pull-${ore}`, machine: 'intake', inputs: {}, output: ore, perMin: 40 })),
  // Smelters refine one ore.
  { id: 'ironPlate', machine: 'smelter', inputs: { iron: 2 }, output: 'ironPlate', perMin: 10 },
  { id: 'nickelBar', machine: 'smelter', inputs: { nickel: 2 }, output: 'nickelBar', perMin: 10 },
  { id: 'water', machine: 'smelter', inputs: { ice: 1 }, output: 'water', perMin: 12 },
  { id: 'siliconWafer', machine: 'smelter', inputs: { silicate: 3 }, output: 'siliconWafer', perMin: 6 },
  // Assemblers combine two goods into a component.
  { id: 'frame', machine: 'assembler', inputs: { ironPlate: 2, nickelBar: 1 }, output: 'frame', perMin: 4 },
  { id: 'coolantCell', machine: 'assembler', inputs: { water: 2, nickelBar: 1 }, output: 'coolantCell', perMin: 4 },
  { id: 'circuit', machine: 'assembler', inputs: { siliconWafer: 1, ironPlate: 1 }, output: 'circuit', perMin: 3 },
];
export const RECIPE_BY_ID = new Map(RECIPES.map((r) => [r.id, r]));

export const MACHINES: Record<MachineKind, { name: string; w: number; h: number; cost: number; help: string }> = {
  intake: { name: 'Ore intake', w: 2, h: 2, cost: 400, help: 'Pulls mined ore from your silo onto the floor.' },
  smelter: { name: 'Smelter', w: 2, h: 2, cost: 800, help: 'Refines ore into plates, bars, water or wafers.' },
  assembler: { name: 'Assembler', w: 3, h: 2, cost: 1500, help: 'Combines two goods into a component.' },
  crate: { name: 'Storage crate', w: 1, h: 1, cost: 150, help: 'Sends whatever arrives into your warehouse.' },
};
export const BELT_COST = 10;
/** Share of the price you get back when you remove something. */
export const REFUND = 0.5;

/** Total units of refined goods and components your warehouse holds. Ore lives in an unlimited silo. */
export const WAREHOUSE_CAPACITY = 5_000;

export const STARTING_CREDITS = 10_000;
