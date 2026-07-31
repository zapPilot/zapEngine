import { describe, expect, it } from 'vitest';
import type { DailySnapshot } from '@zapengine/types/strategy';
import { allocationBar, allocationFromSnapshot } from '../chartAllocation';

function snapshot(weights: Record<string, number | string>): DailySnapshot {
  return {
    schemaVersion: '1',
    strategyId: 'dma_fgi_portfolio_rules',
    strategyVersion: 'v1',
    date: '2026-01-01',
    timestamp: '2026-01-01T00:00:00.000Z',
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
      weight: typeof weight === 'number' ? `${weight.toFixed(2)}%` : weight,
      pricingSource: 'Test',
    })),
    costs: {
      gasUsd: '0',
      slippageUsd: '0',
      protocolFeesUsd: '0',
      totalUsd: '0',
    },
    transactions: [],
    benchmarks: [],
  };
}

describe('allocationFromSnapshot', () => {
  it('reads the three risk assets and treats the rest as cash', () => {
    expect(
      allocationFromSnapshot(snapshot({ BTC: 12, ETH: 12, SPY: 19, USDC: 57 })),
    ).toEqual({ btc: 12, eth: 12, spy: 19, stable: 57 });
  });

  it('names no stablecoin, so an unlisted one still lands in cash', () => {
    const weights = allocationFromSnapshot(
      snapshot({ SPY: 40, GHO: 35, crvUSD: 25 }),
    );

    expect(weights?.stable).toBe(60);
  });

  it('folds several positions in one asset into a single band', () => {
    const weights = allocationFromSnapshot(
      snapshot({ BTC: 20, USDC: 50, ETH: 30 }),
    );

    expect(weights).toEqual({ btc: 20, eth: 30, spy: 0, stable: 50 });
  });

  it('normalises a book whose weights are a fraction of a point off', () => {
    const weights = allocationFromSnapshot(snapshot({ SPY: 49.9, USDC: 49.9 }));

    expect(weights?.spy).toBeCloseTo(50, 6);
    expect(weights?.stable).toBeCloseTo(50, 6);
  });

  it('never reports negative cash when risk weights overshoot', () => {
    const weights = allocationFromSnapshot(
      snapshot({ BTC: 60, ETH: 60, USDC: 0 }),
    );

    expect(weights?.stable).toBe(0);
    expect(weights?.btc).toBeCloseTo(50, 6);
  });

  it('declines to draw a bar for weights that are not a whole book', () => {
    expect(allocationFromSnapshot(snapshot({}))).toBeNull();
    expect(allocationFromSnapshot(snapshot({ BTC: 10, USDC: 20 }))).toBeNull();
    expect(
      allocationFromSnapshot(snapshot({ BTC: 'n/a', USDC: '' })),
    ).toBeNull();
  });
});

describe('allocationBar', () => {
  it('rounds display figures to 100 without changing bar geometry', () => {
    // Independent rounding turns the strategy's opening split into 101, which
    // reads as a broken chart rather than as rounding.
    const { segments } = allocationBar({
      btc: 11.67,
      eth: 11.67,
      spy: 19.16,
      stable: 57.51,
    });

    expect(segments.map((segment) => segment.percent)).toEqual([
      11.67, 11.67, 19.16, 57.51,
    ]);
    expect(segments.map((segment) => segment.display)).toEqual([
      '12%',
      '12%',
      '19%',
      '57%',
    ]);
    expect(
      segments.reduce(
        (sum, segment) => sum + Number.parseInt(segment.display, 10),
        0,
      ),
    ).toBe(100);
  });

  it('keeps raw widths separate from rounded labels', () => {
    const { segments } = allocationBar({
      btc: 0,
      eth: 0,
      spy: 97.51,
      stable: 2.49,
    });

    expect(segments.map((segment) => segment.percent)).toEqual([97.51, 2.49]);
    expect(segments.map((segment) => segment.display)).toEqual(['98%', '2%']);
  });

  it('drops a bucket the strategy has exited', () => {
    const { segments } = allocationBar({
      btc: 0,
      eth: 0,
      spy: 97.51,
      stable: 2.49,
    });

    expect(segments.map((segment) => segment.id)).toEqual(['spy', 'stable']);
  });

  it('drops a sliver below the threshold without stretching the remainder', () => {
    const { segments } = allocationBar({
      btc: 0.2,
      eth: 0,
      spy: 99.8,
      stable: 0,
    });

    expect(segments.map((segment) => segment.id)).toEqual(['spy']);
    expect(segments[0]?.percent).toBe(99.8);
    expect(segments[0]?.display).toBe('100%');
  });

  it('keeps a segment exactly at the 0.5% threshold', () => {
    const { segments } = allocationBar({
      btc: 0.5,
      eth: 49.8,
      spy: 49.7,
      stable: 0,
    });

    expect(segments.map((segment) => segment.id)).toEqual([
      'btc',
      'eth',
      'spy',
    ]);
    expect(segments[0]?.percent).toBe(0.5);
  });

  it('colours each band by the marker palette, cash apart', () => {
    const { segments } = allocationBar({
      btc: 25,
      eth: 25,
      spy: 25,
      stable: 25,
    });

    expect(segments.map((segment) => segment.color)).toEqual([
      'var(--event-btc)',
      'var(--event-eth)',
      'var(--event-spy)',
      'var(--event-stable)',
    ]);
  });

  it('carries a label and a figures flag only when asked', () => {
    const plain = allocationBar({ btc: 0, eth: 0, spy: 50, stable: 50 });
    const before = allocationBar(
      { btc: 0, eth: 0, spy: 50, stable: 50 },
      { label: 'Before', showValues: false },
    );

    expect(plain.label).toBeUndefined();
    expect(plain.showValues).toBeUndefined();
    expect(before.label).toBe('Before');
    expect(before.showValues).toBe(false);
  });
});
