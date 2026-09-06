import { describe, expect, it } from 'vitest';

import type { DailyValuePoint } from '../src/integration/portfolioMetrics';
import {
  hasUsableAttribution,
  summarizeRangeAttribution,
} from '../src/integration/rangeAttribution';

const explainedDay = (
  date: string,
  total_value_usd: number,
  attribution: NonNullable<DailyValuePoint['attribution']>,
): DailyValuePoint => ({ date, total_value_usd, attribution });

describe('summarizeRangeAttribution', () => {
  const points: DailyValuePoint[] = [
    { date: '2026-08-01', total_value_usd: 1_000 },
    explainedDay('2026-08-02', 1_100, [
      { kind: 'market', label: 'ETH', valueUsd: 80 },
      { kind: 'protocol', label: 'Aave', valueUsd: 5 },
      { kind: 'flow', label: 'USDC', valueUsd: 10 },
      { kind: 'residual', valueUsd: 5 },
    ]),
    explainedDay('2026-08-03', 1_050, [
      { kind: 'market', label: 'ETH', valueUsd: -60 },
      { kind: 'protocol', label: 'Aave', valueUsd: 5 },
      { kind: 'residual', valueUsd: 5 },
    ]),
  ];

  it('splits the net change into buckets that add back up to it', () => {
    const summary = summarizeRangeAttribution(points)!;

    expect(summary.netChangeUsd).toBe(50);
    expect(summary.marketUsd).toBe(20);
    expect(summary.protocolUsd).toBe(10);
    expect(summary.flowUsd).toBe(10);
    expect(summary.otherUsd).toBeCloseTo(10);
    expect(
      summary.marketUsd +
        summary.protocolUsd +
        summary.flowUsd +
        summary.otherUsd,
    ).toBeCloseTo(summary.netChangeUsd);
  });

  it('counts gains and losses from market and protocol moves only', () => {
    const summary = summarizeRangeAttribution(points)!;

    // A deposit is not a gain, and a snapshot-gap residual is not a loss.
    expect(summary.gainsUsd).toBe(90);
    expect(summary.lossesUsd).toBe(-60);
    expect(summary.gainsUsd + summary.lossesUsd).toBeCloseTo(
      summary.marketUsd + summary.protocolUsd,
    );
  });

  it('puts an entirely unexplained day into other', () => {
    const summary = summarizeRangeAttribution([
      { date: '2026-08-01', total_value_usd: 1_000 },
      explainedDay('2026-08-02', 1_100, [
        { kind: 'market', label: 'ETH', valueUsd: 100 },
      ]),
      { date: '2026-08-03', total_value_usd: 1_600 },
    ])!;

    expect(summary.marketUsd).toBe(100);
    expect(summary.otherUsd).toBeCloseTo(500);
    expect(summary.attributedDays).toBe(1);
    expect(summary.totalDays).toBe(2);
  });

  it('returns null below two usable points', () => {
    expect(summarizeRangeAttribution([])).toBeNull();
    expect(
      summarizeRangeAttribution([{ date: '2026-08-01', total_value_usd: 10 }]),
    ).toBeNull();
    expect(
      summarizeRangeAttribution([
        { date: '2026-08-01' },
        { date: '2026-08-02', total_value_usd: 10 },
      ]),
    ).toBeNull();
  });
});

describe('hasUsableAttribution', () => {
  const base = {
    netChangeUsd: 0,
    marketUsd: 0,
    protocolUsd: 0,
    flowUsd: 0,
    otherUsd: 0,
    gainsUsd: 0,
    lossesUsd: 0,
  };

  it('needs at least half the days explained', () => {
    expect(
      hasUsableAttribution({ ...base, attributedDays: 5, totalDays: 10 }),
    ).toBe(true);
    expect(
      hasUsableAttribution({ ...base, attributedDays: 4, totalDays: 10 }),
    ).toBe(false);
    expect(
      hasUsableAttribution({ ...base, attributedDays: 0, totalDays: 0 }),
    ).toBe(false);
  });
});
