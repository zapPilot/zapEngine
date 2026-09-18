import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDailyAllocations } from '../data/track-record-allocations';
import { coverageDays, getDistributionSnapshot } from '../data/distribution';
import { signalsAsOf } from '../data/market-signals';
import {
  captureWaitlistFirstTouch,
  readWaitlistAttribution,
} from '../lib/waitlist-attribution';
import { deriveEventsFromSnapshots } from '../data/track-record-events';
import { allocationBar } from '../components/track-record/chartAllocation';

const snapshot = getDistributionSnapshot();

describe('coverage handoff: landing data boundaries', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('rejects invalid allocation metadata before reading rows', () => {
    expect(parseDailyAllocations(null, 1)).toEqual([]);
    expect(parseDailyAllocations({}, 1)).toEqual([]);
    expect(parseDailyAllocations({ assets: [], values: [] }, -1)).toEqual([]);
    expect(parseDailyAllocations({ assets: [], values: [] }, 1.5)).toEqual([]);
  });

  it('rejects malformed coverage dates', () => {
    expect(
      coverageDays({
        ...snapshot,
        coverage: {
          ...snapshot.coverage,
          firstEpisodeAt: 'not-a-date',
          lastEpisodeAt: 'also-not-a-date',
        },
      }),
    ).toBeNull();
  });

  it('reports no signal date for an empty history', () => {
    expect(signalsAsOf({ snapshots: [] } as never)).toBe('');
  });

  it('does not touch browser storage during server rendering', () => {
    vi.stubGlobal('window', undefined);
    expect(captureWaitlistFirstTouch()).toBeNull();
    expect(readWaitlistAttribution()).toBeNull();
  });

  it('covers an empty allocation without manufacturing percentages', () => {
    expect(
      allocationBar({ btc: 0, eth: 0, spy: 0, stable: 0 }).segments,
    ).toEqual([]);
  });

  it('keeps malformed committed event records out of the public list', async () => {
    vi.doMock('../data/equity-curve.json', () => ({
      default: {
        events: [
          null,
          {},
          { date: 1, type: 'buy' },
          { date: '2026-01-01', type: 'unknown' },
          {
            date: '2026-01-02',
            type: 'buy',
            fromAssets: [1, 'BTC'],
            toAsset: 'ETH',
            amountUsd: Number.NaN,
            amountPercent: 5,
          },
        ],
        series: [{ values: [{ date: '2026-01-02', value: 101 }] }],
      },
    }));
    const events = await import('../data/track-record-events');
    expect(events.demoStrategyEvents()).toEqual([
      expect.objectContaining({
        date: '2026-01-02',
        type: 'buy',
        fromAssets: ['BTC'],
        reason: '',
        amountPercent: 5,
      }),
    ]);
  });

  it('sorts multiple source assets by the size of their reduction', () => {
    const base = (date: string, weights: Record<string, number>) =>
      ({
        date,
        transactions: [{ type: 'rebalance' }],
        positions: Object.entries(weights).map(([asset, weight]) => ({
          asset,
          weight: `${weight}%`,
        })),
      }) as never;
    const [event] = deriveEventsFromSnapshots([
      base('2026-01-01', { BTC: 50, ETH: 30, SPY: 10, USDC: 10 }),
      base('2026-01-02', { BTC: 20, ETH: 20, SPY: 50, USDC: 10 }),
    ]);
    expect(event?.fromAssets).toEqual(['BTC', 'ETH']);
    expect(event?.toAsset).toBe('SPY');
  });
});
