import { describe, expect, it } from 'vitest';

import { projectMonthEnd } from './time.js';

describe('projectMonthEnd without a prior month', () => {
  it('reproduces the legacy value * monthDays / elapsedDays extrapolation', () => {
    // 2026-08-16T00:00 is 15 elapsed days of a 31-day month: 10 * 31 / 15.
    expect(projectMonthEnd(10, new Date('2026-08-16T00:00:00.000Z'))).toBe(
      20.67,
    );
  });

  it('returns exactly zero for zero month-to-date spend', () => {
    expect(projectMonthEnd(0, new Date('2026-08-16T00:00:00.000Z'))).toBe(0);
  });

  it('uses each month its own UTC length rather than a hardcoded 30 days', () => {
    // One elapsed day, so the projection is value * monthDays.
    expect(projectMonthEnd(10, new Date('2026-08-02T00:00:00.000Z'))).toBe(310);
    expect(projectMonthEnd(10, new Date('2026-09-02T00:00:00.000Z'))).toBe(300);
    expect(projectMonthEnd(10, new Date('2028-02-02T00:00:00.000Z'))).toBe(290);
    expect(projectMonthEnd(10, new Date('2027-02-02T00:00:00.000Z'))).toBe(280);
  });
});

describe('projectMonthEnd with a prior month total', () => {
  it('keeps the runaway first-day multiplier in check: $19 blended vs $320 legacy', () => {
    const now = new Date('2026-09-01T04:30:00.000Z');
    expect(projectMonthEnd(2, now)).toBe(320);
    expect(projectMonthEnd(2, now, 9.2)).toBeCloseTo(19.13, 2);
  });

  it('ignores the prior once seven days have elapsed', () => {
    const now = new Date('2026-08-16T00:00:00.000Z');
    expect(projectMonthEnd(10, now, 100)).toBe(projectMonthEnd(10, now));
    expect(projectMonthEnd(10, now, 0)).toBe(projectMonthEnd(10, now));
  });

  it('is continuous across the seven-day seam', () => {
    const justUnder = projectMonthEnd(
      10,
      new Date('2026-08-07T23:59:59.999Z'),
      9.2,
    );
    const justOver = projectMonthEnd(
      10,
      new Date('2026-08-08T00:00:01.000Z'),
      9.2,
    );
    expect(Math.abs(justUnder - justOver)).toBeLessThan(0.01);
  });

  it('still projects spend when month-to-date is zero, decaying to zero by the seam', () => {
    expect(
      projectMonthEnd(0, new Date('2026-09-01T04:30:00.000Z'), 9.2),
    ).toBeCloseTo(8.61, 2);
    expect(projectMonthEnd(0, new Date('2026-09-08T00:00:00.000Z'), 9.2)).toBe(
      0,
    );
  });

  it('treats a prior of zero as real data and a prior of null as no data', () => {
    const now = new Date('2026-09-01T04:30:00.000Z');
    const legacy = projectMonthEnd(2, now);
    expect(projectMonthEnd(2, now, 0)).toBeCloseTo(10.52, 2);
    expect(projectMonthEnd(2, now, 0)).toBeLessThan(legacy);
    expect(projectMonthEnd(2, now, null)).toBe(legacy);
    expect(projectMonthEnd(2, now, Number.NaN)).toBe(legacy);
    expect(projectMonthEnd(2, now, -5)).toBe(legacy);
  });

  it("divides the prior by the prior month's own length", () => {
    // Same $28 prior, but February 2028 has 29 days and February 2027 has 28,
    // so March 2028 inherits the lower daily rate.
    expect(
      projectMonthEnd(0, new Date('2028-03-01T04:30:00.000Z'), 28),
    ).toBeCloseTo(28.95, 2);
    expect(
      projectMonthEnd(0, new Date('2027-03-01T04:30:00.000Z'), 28),
    ).toBeCloseTo(29.99, 2);
  });

  it('reaches back across the year boundary for a January prior', () => {
    // December 2025, 31 days, so a $31 prior is $1/day.
    expect(
      projectMonthEnd(0, new Date('2026-01-01T04:30:00.000Z'), 31),
    ).toBeCloseTo(29.99, 2);
  });
});
