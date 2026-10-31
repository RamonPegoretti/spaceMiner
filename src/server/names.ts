const FIRST = ['Rusty', 'Nova', 'Dusty', 'Comet', 'Bolt', 'Orbit', 'Flint', 'Vega', 'Kessel', 'Mags', 'Juno', 'Tycho'];
const LAST = ['Driller', 'Hauler', 'Smelt', 'Rocker', 'Vance', 'Quill', 'Marr', 'Okafor', 'Lindqvist', 'Moreau', 'Saito', 'Reyes'];

/** A random test-pilot name like "Nova Hauler-42". */
export function randomPilotName(): string {
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
  return `${pick(FIRST)} ${pick(LAST)}-${Math.floor(Math.random() * 90 + 10)}`;
}
