import { describe, expect, it } from 'vitest';
import type { DailySnapshot } from '@zapengine/types/strategy';
import equityCurve from '@/data/equity-curve.json';
import {
  demoStrategyEventDates,
  demoStrategyEvents,
  deriveEventsFromSnapshots,
  eventAction,
  eventAsset,
} from '@/data/track-record-events';

function snapshot(
  date: string,
  weights: Record<string, number>,
  rebalanced = true,
): DailySnapshot {
  return {
    schemaVersion: '1',
    strategyId: 'dma_fgi_portfolio_rules',
    strategyVersion: 'v1',
    date,
    timestamp: `${date}T00:00:00.000Z`,
    chainIds: [1],
    walletAddresses: ['0x0000000000000000000000000000000000000001'],
    previousCid: null,
    nav: { usd: '10000.00' },
    performance: {
      dailyReturn: '0.00%',
      cumulativeReturn: '0.00%',
      maxDrawdown: '0.00%',
    },
    positions: Object.entries(weights).map(([asset, weight]) => ({
      chainId: 1,
      protocol: 'Test',
      asset,
      amount: '1',
      valueUsd: '1',
      weight: `${weight.toFixed(2)}%`,
      pricingSource: 'Test',
    })),
    costs: {
      gasUsd: '0',
      slippageUsd: '0',
      protocolFeesUsd: '0',
      totalUsd: '0',
    },
    transactions: rebalanced
      ? [{ chainId: 1, hash: '0xabc', type: 'rebalance' as const }]
      : [],
    benchmarks: [],
  };
}

describe('deriveEventsFromSnapshots', () => {
  it('ignores days with no rebalance transaction', () => {
    const events = deriveEventsFromSnapshots([
      snapshot('2026-01-01', { BTC: 50, USDC: 50 }),
      snapshot('2026-01-02', { BTC: 20, USDC: 80 }, false),
    ]);

    expect(events).toEqual([]);
  });

  it('never emits on the first snapshot, which has no predecessor', () => {
    const events = deriveEventsFromSnapshots([
      snapshot('2026-01-01', { BTC: 50, USDC: 50 }),
    ]);

    expect(events).toEqual([]);
  });

  it('reads a risk increase as a buy', () => {
    const events = deriveEventsFromSnapshots([
      snapshot('2026-01-01', { BTC: 20, USDC: 80 }),
      snapshot('2026-01-02', { BTC: 60, USDC: 40 }),
    ]);

    expect(events).toEqual([
      {
        date: '2026-01-02',
        type: 'buy',
        toAsset: 'BTC',
        fromAssets: [],
        reason: 'Rebalance',
      },
    ]);
  });

  it('reads a risk decrease as a sell', () => {
    const [event] = deriveEventsFromSnapshots([
      snapshot('2026-01-01', { ETH: 60, USDC: 40 }),
      snapshot('2026-01-02', { ETH: 10, USDC: 90 }),
    ]);

    expect(event?.type).toBe('sell');
    expect(event?.toAsset).toBeNull();
    expect(event?.fromAssets).toEqual(['ETH']);
  });

  it('reads one asset up and another down as a single rotation', () => {
    const events = deriveEventsFromSnapshots([
      snapshot('2026-01-01', { BTC: 40, ETH: 20, USDC: 40 }),
      snapshot('2026-01-02', { BTC: 10, ETH: 50, USDC: 40 }),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('rotate_to_eth');
    expect(events[0]?.fromAssets).toEqual(['BTC']);
  });

  it('picks the largest gainer when several assets move', () => {
    const [event] = deriveEventsFromSnapshots([
      snapshot('2026-01-01', { BTC: 60, ETH: 10, SPY: 10, USDC: 20 }),
      snapshot('2026-01-02', { BTC: 10, ETH: 25, SPY: 45, USDC: 20 }),
    ]);

    expect(event?.type).toBe('rotate_to_spy');
    expect(event?.toAsset).toBe('SPY');
  });

  it('treats sub-threshold weight drift as no decision', () => {
    // The demo dataset held constant weights for 500 days before the backtest
    // events landed; pinning this keeps "no markers" a deliberate outcome
    // rather than a silent one.
    const events = deriveEventsFromSnapshots([
      snapshot('2026-01-01', { BTC: 42, USDC: 58 }),
      snapshot('2026-01-02', { BTC: 42.2, USDC: 57.8 }),
    ]);

    expect(events).toEqual([]);
  });

  it('ignores assets outside the marker palette', () => {
    const events = deriveEventsFromSnapshots([
      snapshot('2026-01-01', { DOGE: 10, USDC: 90 }),
      snapshot('2026-01-02', { DOGE: 70, USDC: 30 }),
    ]);

    expect(events).toEqual([]);
  });

  it('survives malformed weight strings without producing NaN', () => {
    const previous = snapshot('2026-01-01', { BTC: 20, USDC: 80 });
    const current = snapshot('2026-01-02', { BTC: 60, USDC: 40 });
    previous.positions[0]!.weight = 'n/a';
    current.positions[1]!.weight = '';

    const [event] = deriveEventsFromSnapshots([previous, current]);

    expect(event?.type).toBe('buy');
    expect(event?.toAsset).toBe('BTC');
  });
});

describe('demoStrategyEvents', () => {
  it('reads every backtest event out of the committed artifact', () => {
    const events = demoStrategyEvents();

    expect(events).toHaveLength(equityCurve.eventsMeta.count);
    expect(events.length).toBeGreaterThan(0);
  });

  it('anchors every event to a date the strategy series actually has', () => {
    const seriesByDate = new Map(
      equityCurve.series[0]!.values.map((point) => [point.date, point.value]),
    );

    for (const event of demoStrategyEvents()) {
      expect(seriesByDate.has(event.date)).toBe(true);
      // Redundant with the join on purpose: it catches an artifact whose
      // events and series were generated from different runs.
      expect(event.indexedValue).toBe(seriesByDate.get(event.date));
    }
  });

  it('emits strictly increasing, unique dates', () => {
    const dates = demoStrategyEvents().map((event) => event.date);

    expect(new Set(dates).size).toBe(dates.length);
    expect([...dates].sort()).toEqual(dates);
  });

  it('gives every event a nameable asset to colour by', () => {
    for (const event of demoStrategyEvents()) {
      expect(eventAsset(event)).not.toBeNull();
    }
  });

  it('exposes the same dates as a set for the demo snapshots', () => {
    expect(demoStrategyEventDates().size).toBe(demoStrategyEvents().length);
  });
});

describe('eventAction and eventAsset', () => {
  const base = { date: '2026-01-01', reason: '' } as const;

  it('collapses the three rotation types onto one action', () => {
    expect(
      eventAction({
        ...base,
        type: 'rotate_to_btc',
        toAsset: 'BTC',
        fromAssets: [],
      }),
    ).toBe('rotate');
    expect(
      eventAction({ ...base, type: 'buy', toAsset: 'BTC', fromAssets: [] }),
    ).toBe('buy');
  });

  it('colours a sell by the position it left, since it has no destination', () => {
    expect(
      eventAsset({ ...base, type: 'sell', toAsset: null, fromAssets: ['SPY'] }),
    ).toBe('SPY');
  });

  it('returns null when no palette asset is involved', () => {
    expect(
      eventAsset({
        ...base,
        type: 'sell',
        toAsset: null,
        fromAssets: ['DOGE'],
      }),
    ).toBeNull();
  });
});
