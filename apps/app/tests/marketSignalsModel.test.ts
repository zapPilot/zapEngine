import type { MarketDashboardResponse } from '@zapengine/app-core/services/analyticsService';
import { describe, expect, it } from 'vitest';

import {
  marketSignalsFromDashboard,
  normalizeSignalRegime,
  signalWindowStart,
} from '@/integration/marketSignalsModel';

type Values = MarketDashboardResponse['snapshots'][number]['values'];

function dashboard(
  days: { date: string; values: Values }[],
): MarketDashboardResponse {
  return {
    series: {},
    meta: {
      primary_series: 'btc',
      days_requested: days.length,
      count: days.length,
      timestamp: '2026-09-24T00:00:00Z',
    },
    snapshots: days.map(({ date, values }) => ({
      snapshot_date: date,
      values,
    })),
  };
}

function asset(value: number, dma: number | null, isAbove?: boolean | null) {
  return {
    value,
    indicators:
      dma === null
        ? {}
        : { dma_200: { value: dma, is_above: isAbove ?? value > dma } },
    tags: {},
  };
}

function gauge(value: number, regime?: string) {
  return {
    value,
    indicators: {},
    tags: regime === undefined ? {} : { regime },
  };
}

describe('marketSignalsFromDashboard', () => {
  it('returns null without snapshots or known series', () => {
    expect(marketSignalsFromDashboard(undefined)).toBeNull();
    expect(marketSignalsFromDashboard(dashboard([]))).toBeNull();
    expect(
      marketSignalsFromDashboard(
        dashboard([{ date: '2026-09-24', values: { sol: asset(1, 1) } }]),
      ),
    ).toBeNull();
  });

  it('derives distance and the start of the current side of the 200-DMA', () => {
    const signals = marketSignalsFromDashboard(
      dashboard([
        { date: '2026-09-20', values: { btc: asset(90, 100) } },
        { date: '2026-09-21', values: { btc: asset(95, 100) } },
        { date: '2026-09-22', values: { btc: asset(105, 100) } },
        { date: '2026-09-23', values: { btc: asset(110, 100) } },
        { date: '2026-09-24', values: { btc: asset(120, 100) } },
      ]),
    );

    expect(signals?.asOf).toBe('2026-09-24');
    expect(signals?.trends).toHaveLength(1);
    const btc = signals!.trends[0]!;
    expect(btc).toMatchObject({
      id: 'btc',
      latestDate: '2026-09-24',
      latest: 120,
      dma: 100,
      isAbove: true,
      sideSince: '2026-09-22',
      values: [90, 95, 105, 110, 120],
      dmaValues: [100, 100, 100, 100, 100],
    });
    expect(btc.distance).toBeCloseTo(0.2);
  });

  it('prefers the backend is_above flag and reports a run spanning the window as null', () => {
    const btc = marketSignalsFromDashboard(
      dashboard([
        // The backend compares strictly, so equality is "not above".
        { date: '2026-09-23', values: { btc: asset(100, 100, false) } },
        { date: '2026-09-24', values: { btc: asset(99, 100, false) } },
      ]),
    )!.trends[0]!;

    expect(btc.isAbove).toBe(false);
    expect(btc.sideSince).toBeNull();
  });

  it('keeps assets without a DMA but leaves their side unknown', () => {
    const spy = marketSignalsFromDashboard(
      dashboard([
        { date: '2026-09-23', values: { spy: asset(500, null) } },
        { date: '2026-09-24', values: { spy: asset(505, null) } },
      ]),
    )!.trends[0]!;

    expect(spy).toMatchObject({
      id: 'spy',
      dma: null,
      distance: null,
      isAbove: null,
      sideSince: null,
      dmaValues: [null, null],
    });
  });

  it('orders series and skips days a series is missing from', () => {
    const signals = marketSignalsFromDashboard(
      dashboard([
        {
          date: '2026-09-23',
          values: {
            eth_btc: asset(0.03, 0.029),
            btc: asset(80000, 70000),
            fgi: gauge(60, 'g'),
          },
        },
        {
          date: '2026-09-24',
          values: {
            eth_btc: asset(0.031, 0.029),
            btc: asset(81000, 70000),
            macro_fear_greed: gauge(35.94, 'fear'),
          },
        },
      ]),
    )!;

    expect(signals.trends.map((signal) => signal.id)).toEqual([
      'btc',
      'eth_btc',
    ]);
    expect(signals.sentiments.map((signal) => signal.id)).toEqual([
      'fgi',
      'macro_fear_greed',
    ]);
    expect(signals.sentiments[0]).toMatchObject({
      latestDate: '2026-09-23',
      dates: ['2026-09-23'],
    });
  });

  it('tracks the current regime run and the regime before it', () => {
    const fgi = marketSignalsFromDashboard(
      dashboard([
        { date: '2026-09-20', values: { fgi: gauge(40, 'f') } },
        { date: '2026-09-21', values: { fgi: gauge(50, 'n') } },
        { date: '2026-09-22', values: { fgi: gauge(60, 'g') } },
        { date: '2026-09-23', values: { fgi: gauge(70, 'g') } },
        { date: '2026-09-24', values: { fgi: gauge(74, 'g') } },
      ]),
    )!.sentiments[0]!;

    expect(fgi).toMatchObject({
      latest: 74,
      regime: 'greed',
      previousRegime: 'neutral',
      regimeSince: '2026-09-22',
    });
  });

  it('reads macro provider labels and leaves unknown regimes empty', () => {
    const [steady, unlabeled] = [
      marketSignalsFromDashboard(
        dashboard([
          {
            date: '2026-09-23',
            values: { macro_fear_greed: gauge(30, 'fear') },
          },
          {
            date: '2026-09-24',
            values: { macro_fear_greed: gauge(35, 'fear') },
          },
        ]),
      )!.sentiments[0]!,
      marketSignalsFromDashboard(
        dashboard([{ date: '2026-09-24', values: { fgi: gauge(35) } }]),
      )!.sentiments[0]!,
    ];

    expect(steady).toMatchObject({
      regime: 'fear',
      previousRegime: null,
      regimeSince: null,
    });
    expect(unlabeled).toMatchObject({
      regime: null,
      previousRegime: null,
      regimeSince: null,
    });
  });
});

describe('normalizeSignalRegime', () => {
  it.each([
    ['ef', 'extreme_fear'],
    ['eg', 'extreme_greed'],
    ['extreme_greed', 'extreme_greed'],
    ['Extreme Fear', 'extreme_fear'],
    ['extreme-greed', 'extreme_greed'],
    [' Neutral ', 'neutral'],
  ])('maps %s to %s', (raw, expected) => {
    expect(normalizeSignalRegime(raw)).toBe(expected);
  });

  it.each([undefined, '', 'bullish'])('rejects %s', (raw) => {
    expect(normalizeSignalRegime(raw)).toBeNull();
  });
});

describe('signalWindowStart', () => {
  const dates = ['2025-09-24', '2026-03-01', '2026-06-01', '2026-09-24'];

  it('starts each range after its cutoff from the latest date', () => {
    expect(signalWindowStart(dates, '1Y')).toBe(1);
    expect(signalWindowStart(dates, '6M')).toBe(2);
    expect(signalWindowStart(dates, '3M')).toBe(3);
  });

  it('falls back to the first point for empty or fully-covered histories', () => {
    expect(signalWindowStart([], '3M')).toBe(0);
    expect(signalWindowStart(['2026-09-20', '2026-09-24'], '1Y')).toBe(0);
  });
});
