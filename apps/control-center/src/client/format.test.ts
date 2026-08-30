import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  daysAgo,
  headlineScale,
  duration,
  filterKnownAccruedCost,
  hoursAgo,
  integer,
  percent,
  providerUsage,
  relativeTime,
  statusLabel,
  usd,
  usdWhole,
} from './format.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('client formatters', () => {
  // A missing number and a zero mean different things to an operator, so the
  // dash is never allowed to collapse into "0".
  it('keeps absent values visibly absent', () => {
    expect(usd(null)).toBe('—');
    expect(usdWhole(undefined)).toBe('—');
    expect(integer(null)).toBe('—');
    expect(percent(undefined)).toBe('—');
    expect(duration(null)).toBe('—');
    expect(usd(0)).toBe('$0.00');
    expect(integer(0)).toBe('0');
  });

  it('drops cents from headline money and keeps them in the ledger', () => {
    expect(usdWhole(179_612.34)).toBe('$179,612');
    expect(usd(179_612.34)).toBe('$179,612.34');
  });

  it('marks only pathologically long headlines for shrinking', () => {
    expect(headlineScale('$179,612')).toBe('');
    expect(headlineScale('-$26,963,562,000,000,000,000,000')).toBe('long');
  });

  it('formats the remaining scalar shapes', () => {
    expect(percent(0.4213)).toBe('42.1%');
    expect(duration(125)).toBe('2:05');
    expect(duration(42)).toBe('42s');
    expect(providerUsage('usd', 12.5)).toBe('$12.50');
    expect(providerUsage('units', 4200)).toBe('4,200 units');
    expect(statusLabel('degraded')).toBe('Degraded');
    expect(statusLabel(undefined)).toBe('Unknown');
    expect(daysAgo(0)).toBe('today');
    expect(daysAgo(3)).toBe('3d ago');
    expect(daysAgo(null)).toBe('never');
    expect(hoursAgo(12)).toBe('12h');
    expect(hoursAgo(72)).toBe('3d');
    expect(hoursAgo(null)).toBe('never');
  });

  it('reads recent timestamps as elapsed time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));
    expect(relativeTime('2026-08-28T11:59:30.000Z')).toBe('just now');
    expect(relativeTime('2026-08-28T11:20:00.000Z')).toBe('40 min ago');
    expect(relativeTime('2026-08-26T12:00:00.000Z')).not.toContain('ago');
  });

  it('drops points the cost sync never recorded', () => {
    expect(
      filterKnownAccruedCost([
        { date: '2026-08-01', accruedCostUsd: 4 },
        { date: '2026-08-02', accruedCostUsd: null },
      ]),
    ).toEqual([{ date: '2026-08-01', accruedCostUsd: 4 }]);
  });
});
