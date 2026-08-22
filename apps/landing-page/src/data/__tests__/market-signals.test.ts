import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketDashboardResponse } from '@zapengine/types/api';
import {
  gaugeSeries,
  getMarketSignals,
  seriesWithDma,
  signalsAsOf,
} from '../market-signals';

function fixture(): MarketDashboardResponse {
  const descriptor = {
    kind: 'asset' as const,
    unit: 'usd',
    label: 'Test',
    frequency: 'daily' as const,
    color_hint: null,
    scale: null,
  };
  return {
    series: { btc: descriptor },
    snapshots: [
      {
        snapshot_date: '2026-08-20',
        values: {
          btc: {
            value: 100,
            indicators: { dma_200: { value: 90, is_above: true } },
            tags: {},
          },
        },
      },
      {
        snapshot_date: '2026-08-21',
        values: {
          btc: { value: 101, indicators: {}, tags: { regime: 'g' } },
        },
      },
    ],
    meta: {
      primary_series: 'btc',
      days_requested: 365,
      count: 2,
      timestamp: '2026-08-21T00:00:00Z',
    },
  };
}

describe('market signals accessor', () => {
  afterEach(() => {
    vi.doUnmock('../market-signals.json');
    vi.resetModules();
  });

  it('accepts the committed artifact', () => {
    const signals = getMarketSignals();
    expect(signals?.snapshots.length).toBeGreaterThan(300);
    expect(Object.keys(signals?.series ?? {})).toEqual(
      expect.arrayContaining([
        'btc',
        'eth',
        'spy',
        'eth_btc',
        'fgi',
        'macro_fear_greed',
      ]),
    );
  });

  it('accepts and memoizes a minimal valid fixture', async () => {
    const minimal = fixture();
    vi.doMock('../market-signals.json', () => ({ default: minimal }));
    const accessor = await import('../market-signals');

    expect(accessor.getMarketSignals()).toEqual(minimal);
    expect(accessor.getMarketSignals()).toBe(accessor.getMarketSignals());
  });

  it('degrades invalid data to null', async () => {
    vi.doMock('../market-signals.json', () => ({ default: { broken: true } }));
    const accessor = await import('../market-signals');

    expect(accessor.getMarketSignals()).toBeNull();
  });

  it('flattens DMA and gauge points while skipping missing series', () => {
    const signals = fixture();

    expect(seriesWithDma(signals, 'btc')).toEqual([
      { date: '2026-08-20', value: 100, dma: 90 },
      { date: '2026-08-21', value: 101, dma: null },
    ]);
    expect(seriesWithDma(signals, 'eth')).toEqual([]);
    expect(gaugeSeries(signals, 'btc').at(-1)).toEqual({
      date: '2026-08-21',
      value: 101,
      regime: 'g',
    });
    expect(signalsAsOf(signals)).toBe('2026-08-21');
  });
});
