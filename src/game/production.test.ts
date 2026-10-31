import { describe, expect, it } from 'vitest';
import { accrue, fieldRemaining, minutesUntilDry } from './production';

const MIN = 60_000;

describe('accrue', () => {
  it('adds production for the time that passed', () => {
    expect(accrue({ amount: 10, updatedAt: 0 }, 6, 10 * MIN)).toEqual({ amount: 70, updatedAt: 10 * MIN });
  });

  it('keeps producing across a long offline gap', () => {
    const day = 24 * 60 * MIN;
    expect(accrue({ amount: 0, updatedAt: 0 }, 1, day).amount).toBe(1440);
  });

  it('stops at storage capacity', () => {
    expect(accrue({ amount: 90, updatedAt: 0 }, 5, 10 * MIN, 100).amount).toBe(100);
  });

  it('never goes below zero when consuming', () => {
    expect(accrue({ amount: 3, updatedAt: 0 }, -1, 10 * MIN).amount).toBe(0);
  });

  it('ignores clocks that go backwards', () => {
    const s = { amount: 5, updatedAt: 10 * MIN };
    expect(accrue(s, 1, 5 * MIN)).toBe(s);
  });

  it('gives the same total whether updated once or in many steps', () => {
    let s = { amount: 0, updatedAt: 0 };
    for (let t = 1; t <= 60; t++) s = accrue(s, 2.5, t * MIN);
    expect(s.amount).toBeCloseTo(accrue({ amount: 0, updatedAt: 0 }, 2.5, 60 * MIN).amount);
  });
});

describe('fields', () => {
  it('deplete as they are mined', () => {
    expect(fieldRemaining(1000, 10, 0, 30 * MIN)).toBe(700);
    expect(fieldRemaining(1000, 10, 0, 500 * MIN)).toBe(0);
  });

  it('report time until dry', () => {
    expect(minutesUntilDry(700, 10)).toBe(70);
    expect(minutesUntilDry(700, 0)).toBe(Infinity);
  });
});
