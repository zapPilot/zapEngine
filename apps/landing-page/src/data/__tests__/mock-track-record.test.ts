import { describe, expect, it } from 'vitest';
import { positionsForNav } from '@/data/mock-track-record';

describe('positionsForNav', () => {
  it('filters a position below 0.5 percentage points', () => {
    const positions = positionsForNav(10_000, {
      btc: 49.51,
      eth: 0.49,
      spy: 0,
      stable: 50,
    });

    expect(positions.map((position) => position.asset)).toEqual([
      'BTC',
      'USDC',
    ]);
  });

  it('keeps a position exactly at 0.5 percentage points', () => {
    const positions = positionsForNav(10_000, {
      btc: 49.5,
      eth: 0.5,
      spy: 0,
      stable: 50,
    });

    expect(positions.map((position) => position.asset)).toEqual([
      'BTC',
      'ETH',
      'USDC',
    ]);
    expect(positions.find((position) => position.asset === 'ETH')?.weight).toBe(
      '0.50%',
    );
  });
});
