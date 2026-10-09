import { expect, it } from 'vitest';
import {
  defaultRuleTrace,
  observeRows,
} from '@/integration/decisionTraceModel';
import type { MarketSignals } from '@/integration/marketSignalsModel';
it('filters live trace to configured default rules without inventing a match', () => {
  const rows = defaultRuleTrace(
    [
      { name: 'cross_down_exit', number: 1 },
      { name: 'future', number: 2 },
    ],
    [
      {
        ruleName: 'cross_down_exit',
        status: 'fired',
        suppressedBy: null,
        cooldownRemainingDays: null,
      },
      {
        ruleName: 'disabled',
        status: 'inactive',
        suppressedBy: null,
        cooldownRemainingDays: null,
      },
    ],
  );
  expect(rows[0]?.trace?.status).toBe('fired');
  expect(rows[1]).toMatchObject({ trace: null, labelKey: null });
});
it('clamps only the visual distance, preserving raw values and the previous close', () => {
  const signal = {
    id: 'btc' as const,
    latestDate: '2026-10-02',
    latest: 150,
    dma: 100,
    distance: 0.5,
    isAbove: true,
    sideSince: null,
    dates: ['2026-10-01', '2026-10-02'],
    values: [90, 150],
    dmaValues: [100, 100],
  };
  const data: MarketSignals = {
    asOf: signal.latestDate,
    trends: [
      signal,
      { ...signal, id: 'eth', distance: -0.5, values: [120, 50] },
      { ...signal, id: 'spy', distance: null, values: [], dmaValues: [] },
      { ...signal, id: 'eth_btc', dmaValues: [0, 100] },
      { ...signal, dmaValues: [null, 100] },
    ],
    sentiments: [],
  };
  const rows = observeRows(data);
  expect(rows[0]).toMatchObject({
    distance: 0.5,
    clampedDistance: 0.25,
    previous: 90,
    previousDistance: expect.closeTo(-0.1),
  });
  expect(rows[1]?.clampedDistance).toBe(-0.25);
  expect(rows[2]).toMatchObject({
    clampedDistance: null,
    previousDistance: null,
  });
  expect(rows[3]?.previousDistance).toBeNull();
  expect(observeRows(null)).toEqual([]);
});
