/**
 * Every resource in the game. Recipes and prices build on these ids.
 * Rules in src/game are shared by server and client and have no I/O.
 */
export const ORES = ['iron', 'nickel', 'ice', 'silicate'] as const;
export type Ore = (typeof ORES)[number];

export const ORE_INFO: Record<Ore, { name: string; sprite: string }> = {
  iron: { name: 'Iron ore', sprite: 'iron' },
  nickel: { name: 'Nickel ore', sprite: 'nickel' },
  ice: { name: 'Water ice', sprite: 'ice' },
  silicate: { name: 'Silicate', sprite: 'sil' },
};

export const STARTING_CREDITS = 5_000;
