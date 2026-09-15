import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SECTOR_WEIGHTS as defaults,
  INVEST_SECTORS,
  isValidSectorWeights,
  isDefaultSectorWeights,
  rebalanceSectorWeights,
  resolveTargetAllocations,
  sectorUsd6Shares,
  sectorWeightsFromDrafts,
  sectorAllocationSummary,
} from '@/integration/investSectorModel';
import {
  isValidTargetAllocation,
  targetMinimumUsd6,
  targetUsd6Shares,
} from '@/integration/investTargetsModel';
describe('sector allocation', () => {
  it('resolves the recommendation deterministically and derives the HLP minimum', () => {
    const allocations = resolveTargetAllocations(defaults);
    expect(allocations.map((a) => a.weightBps)).toEqual([3600, 4000, 2400]);
    expect(targetMinimumUsd6(allocations)).toBe(41666667n);
    expect(resolveTargetAllocations(defaults)).toEqual(allocations);
    expect(sectorAllocationSummary(defaults)).toBe(
      'Crypto 40%, Stable 60%, S&P 500 0%',
    );
    expect(isDefaultSectorWeights(defaults)).toBe(true);
  });
  it('rebalance keeps all integer edits valid and locked equity at zero', () => {
    for (let bps = -100; bps <= 10100; bps += 37) {
      const next = rebalanceSectorWeights(defaults, 'crypto', bps);
      expect(isValidSectorWeights(next)).toBe(true);
      expect(isValidTargetAllocation(resolveTargetAllocations(next))).toBe(
        true,
      );
      expect(next.stable + next.crypto).toBe(10000);
    }
    expect(rebalanceSectorWeights(defaults, 'sp500', 9000)).toBe(defaults);
    expect(isValidSectorWeights({ ...defaults, sp500: 1 })).toBe(false);
    expect(
      isValidSectorWeights({ crypto: 1.5, stable: 9998.5, sp500: 0 }),
    ).toBe(false);
  });
  it('distributes third-sector residuals by proportion, then stable order', () => {
    const sectors = INVEST_SECTORS.map((s) => ({ ...s, executable: true }));
    expect(
      rebalanceSectorWeights(
        { crypto: 4000, stable: 4000, sp500: 2000 },
        'crypto',
        3333,
        sectors,
      ),
    ).toEqual({ crypto: 3333, stable: 4445, sp500: 2222 });
    expect(
      rebalanceSectorWeights(
        { crypto: 10000, stable: 0, sp500: 0 },
        'crypto',
        1,
        sectors,
      ),
    ).toEqual({ crypto: 1, stable: 5000, sp500: 4999 });
    expect(
      resolveTargetAllocations({ crypto: 3333, stable: 6667, sp500: 0 }).map(
        (a) => a.weightBps,
      ),
    ).toEqual([4000, 3333, 2667]);
  });
  it('sector dollar totals exactly equal the details, including rounding', () => {
    const weights = { crypto: 3333, stable: 6667, sp500: 0 };
    const positions = targetUsd6Shares(
      '100000001',
      resolveTargetAllocations(weights),
    )!;
    const sectors = sectorUsd6Shares('100000001', weights);
    expect(sectors.stable).toBe(positions['morpho-base'] + positions.hlp);
    expect(sectors.crypto + sectors.stable + sectors.sp500).toBe(100000001n);
    expect(sectorUsd6Shares('0', weights)).toEqual({
      crypto: 0n,
      stable: 0n,
      sp500: 0n,
    });
    expect(sectorWeightsFromDrafts([])).toEqual({
      crypto: 0,
      stable: 0,
      sp500: 0,
    });
  });
});
