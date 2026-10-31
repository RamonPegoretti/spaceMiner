/**
 * Production is computed from timestamps instead of a running game loop,
 * so a factory keeps "working" while its owner is offline or the server sleeps.
 */
export interface Stock {
  amount: number;
  /** Time (ms) the amount was last brought up to date. */
  updatedAt: number;
}

const MINUTE = 60_000;

/** Brings a stock up to `now`, adding `ratePerMin` and stopping at `capacity`. */
export function accrue(stock: Stock, ratePerMin: number, now: number, capacity = Infinity): Stock {
  if (now <= stock.updatedAt) return stock;
  const gained = ((now - stock.updatedAt) / MINUTE) * ratePerMin;
  const amount = Math.max(0, Math.min(capacity, stock.amount + gained));
  return { amount, updatedAt: now };
}

/** Ore left in a field that started with `initial` and has been mined at `ratePerMin` since `since`. */
export function fieldRemaining(initial: number, ratePerMin: number, since: number, now: number): number {
  const mined = (Math.max(0, now - since) / MINUTE) * ratePerMin;
  return Math.max(0, initial - mined);
}

/** Minutes until a field runs dry, or Infinity if nobody is mining it. */
export function minutesUntilDry(remaining: number, ratePerMin: number): number {
  return ratePerMin > 0 ? remaining / ratePerMin : Infinity;
}
