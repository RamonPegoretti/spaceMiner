import type { Ore } from './resources';

/**
 * A hand-placed starter system used until the galaxy generator (milestone 2) exists.
 * Coordinates are map pixels on a 480 x 300 sheet.
 */
export interface Station {
  id: string;
  name: string;
  kind: 'foundry' | 'junction' | 'gate';
  x: number;
  y: number;
}
export interface Field {
  id: string;
  name: string;
  ore: Ore;
  x: number;
  y: number;
  /** 0..1 share of ore left. */
  remaining: number;
}
export interface StarSystem {
  id: string;
  name: string;
  sun: { x: number; y: number };
  stations: Station[];
  fields: Field[];
  /** Hauler lanes between stations and fields, by id. */
  lanes: [string, string][];
}

export const STARTER_SYSTEM: StarSystem = {
  id: 'vasko',
  name: "Vasko's Reach",
  sun: { x: 170, y: 160 },
  stations: [
    { id: 'foundry', name: 'Home Foundry', kind: 'foundry', x: 135, y: 118 },
    { id: 'tessel', name: 'Tessel Junction', kind: 'junction', x: 228, y: 92 },
    { id: 'gate', name: 'Outer Gate', kind: 'gate', x: 58, y: 70 },
  ],
  fields: [
    { id: 'halden', name: 'Halden Belt', ore: 'iron', x: 300, y: 185, remaining: 0.62 },
    { id: 'corva', name: 'Corva Drift', ore: 'ice', x: 92, y: 222, remaining: 0.23 },
    { id: 'myre', name: 'Myre Cluster', ore: 'silicate', x: 215, y: 250, remaining: 0.91 },
    { id: 'osk', name: 'Osk Scatter', ore: 'nickel', x: 370, y: 90, remaining: 0.78 },
  ],
  lanes: [
    ['foundry', 'tessel'],
    ['tessel', 'halden'],
    ['foundry', 'corva'],
    ['foundry', 'gate'],
    ['tessel', 'osk'],
    ['tessel', 'myre'],
  ],
};
