import type { BacktestStrategyPoint } from '@zapengine/app-core/types/backtesting';
import { describe, expect, it } from 'vitest';

import {
  buildBacktestAllocationSegments,
  getBacktestTransferDirection,
  hasBacktestAllocation,
  isBacktestBucket,
  isBacktestTransfer,
  resolveBacktestDisplayAllocation,
} from '@/components/wallet/portfolio/views/backtesting/backtestBuckets';

describe('backtestBuckets', () => {
  it('recognizes valid buckets only', () => {
    expect(isBacktestBucket('spot')).toBe(true);
    expect(isBacktestBucket('stable')).toBe(true);
    expect(isBacktestBucket('eth')).toBe(true);
    expect(isBacktestBucket('btc')).toBe(true);
    expect(isBacktestBucket('spy')).toBe(true);
    expect(isBacktestBucket('lp')).toBe(false);
  });

  it('validates supported transfer buckets only', () => {
    expect(
      isBacktestTransfer({
        from_bucket: 'stable',
        to_bucket: 'spot',
        amount_usd: 100,
      }),
    ).toBe(true);

    expect(
      isBacktestTransfer({
        from_bucket: 'stable',
        to_bucket: 'lp',
        amount_usd: 100,
      }),
    ).toBe(false);
  });

  it('accepts eth and btc as valid transfer buckets', () => {
    expect(
      isBacktestTransfer({
        from_bucket: 'stable',
        to_bucket: 'eth',
        amount_usd: 100,
      }),
    ).toBe(true);

    expect(
      isBacktestTransfer({
        from_bucket: 'btc',
        to_bucket: 'stable',
        amount_usd: 50,
      }),
    ).toBe(true);
  });

  it('maps allocation ratios to UI segments', () => {
    expect(
      buildBacktestAllocationSegments({
        btc: 0.6,
        eth: 0,
        spy: 0,
        stable: 0.4,
        alt: 0,
      }),
    ).toEqual([
      {
        category: 'btc',
        label: 'BTC',
        percentage: 60,
        color: '#F7931A',
      },
      {
        category: 'stable',
        label: 'STABLE',
        percentage: 40,
        color: '#2775CA',
      },
    ]);
  });

  it('maps ETH and stable allocation to UI segments', () => {
    expect(
      buildBacktestAllocationSegments({
        btc: 0,
        eth: 0.6,
        spy: 0,
        stable: 0.4,
        alt: 0,
      }),
    ).toEqual([
      {
        category: 'eth',
        label: 'ETH',
        percentage: 60,
        color: '#627EEA',
      },
      {
        category: 'stable',
        label: 'STABLE',
        percentage: 40,
        color: '#2775CA',
      },
    ]);
  });

  it('maps SPY allocation with shared SPY color', () => {
    expect(
      buildBacktestAllocationSegments({
        btc: 0,
        eth: 0,
        spy: 0.7,
        stable: 0.3,
        alt: 0,
      }),
    ).toEqual([
      {
        category: 'spy',
        label: 'SPY',
        percentage: 70,
        color: '#16A34A',
      },
      {
        category: 'stable',
        label: 'STABLE',
        percentage: 30,
        color: '#2775CA',
      },
    ]);
  });

  it('keeps shared BTC color for BTC allocation', () => {
    const segments = buildBacktestAllocationSegments({
      btc: 0.5,
      eth: 0,
      spy: 0,
      stable: 0.5,
      alt: 0,
    });
    const btcSegment = segments.find((s) => s.label === 'BTC');
    expect(btcSegment?.color).toBe('#F7931A');
  });

  it('maps canonical five-bucket allocation directly', () => {
    const segments = buildBacktestAllocationSegments({
      btc: 0.4,
      eth: 0.2,
      spy: 0,
      stable: 0.3,
      alt: 0.1,
    });

    expect(segments).toEqual([
      {
        category: 'btc',
        label: 'BTC',
        percentage: 40,
        color: '#F7931A',
      },
      {
        category: 'stable',
        label: 'STABLE',
        percentage: 30,
        color: '#2775CA',
      },
      {
        category: 'eth',
        label: 'ETH',
        percentage: 20,
        color: '#627EEA',
      },
      {
        category: 'alt',
        label: 'ALT',
        percentage: 10,
        color: '#6B7280',
      },
    ]);
  });

  it('treats zero allocation as empty and classifies supported directions', () => {
    expect(
      hasBacktestAllocation({ btc: 0, eth: 0, spy: 0, stable: 0, alt: 0 }),
    ).toBe(false);
    expect(getBacktestTransferDirection('stable', 'spot')).toBe(
      'stable_to_spot',
    );
    expect(getBacktestTransferDirection('spot', 'stable')).toBe(
      'spot_to_stable',
    );
  });

  it('treats eth and btc buckets as spot for transfer direction', () => {
    expect(getBacktestTransferDirection('stable', 'eth')).toBe(
      'stable_to_spot',
    );
    expect(getBacktestTransferDirection('stable', 'btc')).toBe(
      'stable_to_spot',
    );
    expect(getBacktestTransferDirection('eth', 'stable')).toBe(
      'spot_to_stable',
    );
    expect(getBacktestTransferDirection('btc', 'stable')).toBe(
      'spot_to_stable',
    );
  });

  it('returns null for spot-to-spot transfers (eth/btc rotation handled at chart level)', () => {
    expect(getBacktestTransferDirection('eth', 'btc')).toBeNull();
    expect(getBacktestTransferDirection('btc', 'eth')).toBeNull();
  });

  it('returns null for invalid transfer direction combinations', () => {
    expect(getBacktestTransferDirection('spot', 'spot')).toBeNull();
    expect(getBacktestTransferDirection('alt', 'stable')).toBeNull();
    expect(getBacktestTransferDirection('stable', 'alt')).toBeNull();
    expect(getBacktestTransferDirection('alt', 'alt')).toBeNull();
  });
});

describe('isBacktestBucket edge cases', () => {
  it('returns false for non-string values', () => {
    expect(isBacktestBucket(123)).toBe(false);
    expect(isBacktestBucket(null)).toBe(false);
    expect(isBacktestBucket(undefined)).toBe(false);
    expect(isBacktestBucket({})).toBe(false);
    expect(isBacktestBucket([])).toBe(false);
    expect(isBacktestBucket(true)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isBacktestBucket('')).toBe(false);
  });

  it('returns true for all valid bucket values', () => {
    expect(isBacktestBucket('spot')).toBe(true);
    expect(isBacktestBucket('stable')).toBe(true);
    expect(isBacktestBucket('btc')).toBe(true);
    expect(isBacktestBucket('eth')).toBe(true);
    expect(isBacktestBucket('spy')).toBe(true);
  });
});

describe('isBacktestTransfer edge cases', () => {
  it('returns false for null or undefined', () => {
    expect(isBacktestTransfer(null)).toBe(false);
    expect(isBacktestTransfer(undefined)).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isBacktestTransfer('string')).toBe(false);
    expect(isBacktestTransfer(123)).toBe(false);
    expect(isBacktestTransfer(true)).toBe(false);
  });

  it('returns false when from_bucket is invalid', () => {
    expect(
      isBacktestTransfer({
        from_bucket: 'invalid' as 'spot',
        to_bucket: 'spot',
        amount_usd: 100,
      }),
    ).toBe(false);
  });

  it('returns false when to_bucket is invalid', () => {
    expect(
      isBacktestTransfer({
        from_bucket: 'spot',
        to_bucket: 'invalid' as 'spot',
        amount_usd: 100,
      }),
    ).toBe(false);
  });

  it('returns false when amount_usd is not a number', () => {
    expect(
      isBacktestTransfer({
        from_bucket: 'spot',
        to_bucket: 'stable',
        amount_usd: '100' as unknown as number,
      }),
    ).toBe(false);
    expect(
      isBacktestTransfer({
        from_bucket: 'spot',
        to_bucket: 'stable',
        amount_usd: undefined,
      }),
    ).toBe(false);
  });
});

describe('hasBacktestAllocation', () => {
  it('returns true when at least one bucket has allocation', () => {
    expect(
      hasBacktestAllocation({ btc: 0.5, eth: 0, spy: 0, stable: 0, alt: 0 }),
    ).toBe(true);
    expect(
      hasBacktestAllocation({ btc: 0, eth: 0.3, spy: 0, stable: 0, alt: 0 }),
    ).toBe(true);
    expect(
      hasBacktestAllocation({ btc: 0, eth: 0, spy: 0.7, stable: 0, alt: 0 }),
    ).toBe(true);
    expect(
      hasBacktestAllocation({ btc: 0, eth: 0, spy: 0, stable: 0.4, alt: 0 }),
    ).toBe(true);
    expect(
      hasBacktestAllocation({ btc: 0, eth: 0, spy: 0, stable: 0, alt: 0.2 }),
    ).toBe(true);
  });

  it('returns false when all buckets are zero', () => {
    expect(
      hasBacktestAllocation({ btc: 0, eth: 0, spy: 0, stable: 0, alt: 0 }),
    ).toBe(false);
  });
});

describe('resolveBacktestDisplayAllocation', () => {
  it('uses asset_allocation when valid BacktestAssetAllocation', () => {
    const strategy = {
      portfolio: {
        asset_allocation: {
          btc: 0.4,
          eth: 0.2,
          spy: 0.1,
          stable: 0.2,
          alt: 0.1,
        },
        allocation: { spot: 100, stable: 50 },
        spot_asset: 'BTC',
      },
    } as BacktestStrategyPoint;

    const result = resolveBacktestDisplayAllocation(strategy);
    expect(result).toEqual({
      btc: 0.4,
      eth: 0.2,
      spy: 0.1,
      stable: 0.2,
      alt: 0.1,
    });
  });

  it('falls back to allocation when asset_allocation is invalid', () => {
    const strategy = {
      portfolio: {
        asset_allocation: null,
        allocation: { btc: 0.4, eth: 0.2, spy: 0.1, stable: 0.2, alt: 0.1 },
        spot_asset: 'BTC',
      },
    } as unknown as BacktestStrategyPoint;

    const result = resolveBacktestDisplayAllocation(strategy);
    expect(result).toEqual({
      btc: 0.4,
      eth: 0.2,
      spy: 0.1,
      stable: 0.2,
      alt: 0.1,
    });
  });

  it('handles legacy allocation format with positive values', () => {
    const strategy = {
      portfolio: {
        asset_allocation: undefined,
        allocation: { spot: 100, stable: 50 },
        spot_asset: 'BTC',
      },
    } as BacktestStrategyPoint;

    const result = resolveBacktestDisplayAllocation(strategy);
    expect(result).not.toBeNull();
    expect(result?.btc).toBe(100);
    expect(result?.stable).toBe(50);
  });

  it('handles legacy allocation with ETH spot asset', () => {
    const strategy = {
      portfolio: {
        asset_allocation: undefined,
        allocation: { spot: 100, stable: 50 },
        spot_asset: 'ETH',
      },
    } as BacktestStrategyPoint;

    const result = resolveBacktestDisplayAllocation(strategy);
    expect(result).not.toBeNull();
    expect(result?.eth).toBe(100);
    expect(result?.btc).toBe(0);
    expect(result?.stable).toBe(50);
  });

  it('handles legacy allocation with SPY spot asset', () => {
    const strategy = {
      portfolio: {
        asset_allocation: undefined,
        allocation: { spot: 100, stable: 50 },
        spot_asset: 'SPY',
      },
    } as BacktestStrategyPoint;

    const result = resolveBacktestDisplayAllocation(strategy);
    expect(result).not.toBeNull();
    expect(result?.spy).toBe(100);
    expect(result?.btc).toBe(0);
    expect(result?.stable).toBe(50);
  });

  it('returns null when both spot and stable are zero in legacy allocation', () => {
    const strategy = {
      portfolio: {
        asset_allocation: undefined,
        allocation: { spot: 0, stable: 0 },
        spot_asset: 'BTC',
      },
    } as BacktestStrategyPoint;

    const result = resolveBacktestDisplayAllocation(strategy);
    expect(result).toBeNull();
  });

  it('returns null when legacy allocation is missing values', () => {
    const strategy = {
      portfolio: {
        asset_allocation: undefined,
        allocation: {},
        spot_asset: 'BTC',
      },
    } as BacktestStrategyPoint;

    const result = resolveBacktestDisplayAllocation(strategy);
    expect(result).toBeNull();
  });

  it('handles legacy allocation with only spot positive', () => {
    const strategy = {
      portfolio: {
        asset_allocation: undefined,
        allocation: { spot: 100 },
        spot_asset: 'BTC',
      },
    } as BacktestStrategyPoint;

    const result = resolveBacktestDisplayAllocation(strategy);
    expect(result).not.toBeNull();
    expect(result?.btc).toBe(100);
    expect(result?.stable).toBe(0);
  });

  it('handles legacy allocation with only stable positive', () => {
    const strategy = {
      portfolio: {
        asset_allocation: undefined,
        allocation: { stable: 75 },
        spot_asset: 'BTC',
      },
    } as BacktestStrategyPoint;

    const result = resolveBacktestDisplayAllocation(strategy);
    expect(result).not.toBeNull();
    expect(result?.btc).toBe(0);
    expect(result?.stable).toBe(75);
  });
});
