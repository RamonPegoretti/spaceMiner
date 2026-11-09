import type { Ore } from '@/game/resources';
import type { FieldView, WorldView } from '@/server/world';

/** The last world state from the server, plus what's needed to run it forward between polls. */
export interface ClientWorld {
  fields: Map<string, FieldView>;
  ore: WorldView['ore'];
  claims: number;
  stockpiles: WorldView['stockpiles'];
  haulers: WorldView['haulers'];
  /** Client clock (ms) when the state arrived. */
  receivedAt: number;
  /** Server clock minus client clock. */
  offset: number;
}

export const toClientWorld = (w: WorldView): ClientWorld => ({
  fields: new Map(w.fields.map((f) => [f.slot, f])),
  ore: w.ore,
  claims: w.claims,
  stockpiles: w.stockpiles,
  haulers: w.haulers,
  receivedAt: Date.now(),
  offset: w.now - Date.now(),
});

export const serverNow = (w: ClientWorld | null) => Date.now() + (w?.offset ?? 0);

/** Tonnes left in a field right now, counting down from the last poll. */
export function remainingNow(w: ClientWorld, f: FieldView) {
  return Math.max(0, f.remaining - (f.rate * (Date.now() - w.receivedAt)) / 60_000);
}

/** Tonnes of an ore the pilot holds right now. */
export function oreNow(w: ClientWorld, ore: Ore) {
  const o = w.ore[ore];
  return o ? o.amount + (o.rate * (Date.now() - w.receivedAt)) / 60_000 : 0;
}

export const fmtTonnes = (t: number) => (t >= 10_000 ? `${(t / 1000).toFixed(1)}k` : Math.floor(t).toLocaleString('en-US'));

export function fmtDuration(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}
