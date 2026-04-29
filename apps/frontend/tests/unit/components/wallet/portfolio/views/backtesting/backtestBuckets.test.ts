import { describe, expect, it } from 'vitest';

import {
  buildBacktestAllocationSegments,
  getBacktestTransferDirection,
  hasBacktestAllocation,
  isBacktestBucket,
  isBacktestTransfer,
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
});
