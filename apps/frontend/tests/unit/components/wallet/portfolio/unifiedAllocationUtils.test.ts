import { describe, expect, it } from 'vitest';

import {
  calculateTotalPercentage,
  getAllocationSummary,
  mapAssetAllocationToUnified,
  mapBacktestToUnified,
  mapLegacyConstituentsToUnified,
  mapPortfolioToUnified,
  mapStrategyToUnified,
} from '@/components/wallet/portfolio/components/allocation/unifiedAllocationUtils';
import { UNIFIED_COLORS } from '@/constants/assets';

describe('unifiedAllocationUtils', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // mapPortfolioToUnified
  // ─────────────────────────────────────────────────────────────────────────

  describe('mapPortfolioToUnified', () => {
    it('maps portfolio allocation to unified segments', () => {
      const result = mapPortfolioToUnified({
        btc: 40,
        eth: 30,
        others: 10,
        stablecoins: 20,
      });

      expect(result).toHaveLength(4);
      expect(result.find((s) => s.category === 'btc')?.percentage).toBe(40);
      expect(result.find((s) => s.category === 'eth')?.percentage).toBe(30);
      expect(result.find((s) => s.category === 'alt')?.percentage).toBe(10);
      expect(result.find((s) => s.category === 'stable')?.percentage).toBe(20);
    });

    it('filters out zero-value segments', () => {
      const result = mapPortfolioToUnified({
        btc: 100,
        eth: 0,
        others: 0,
        stablecoins: 0,
      });

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('btc');
    });

    it('sorts segments by percentage descending', () => {
      const result = mapPortfolioToUnified({
        btc: 10,
        eth: 5,
        others: 25,
        stablecoins: 60,
      });

      // 60% stable > 25% alt > 10% btc > 5% eth
      expect(result[0].category).toBe('stable');
      expect(result[1].category).toBe('alt');
      expect(result[2].category).toBe('btc');
    });

    it('returns empty array for all zeros', () => {
      const result = mapPortfolioToUnified({
        btc: 0,
        eth: 0,
        others: 0,
        stablecoins: 0,
      });

      expect(result).toHaveLength(0);
    });

    it('uses correct colors', () => {
      const result = mapPortfolioToUnified({
        btc: 50,
        eth: 15,
        others: 10,
        stablecoins: 25,
      });

      expect(result.find((s) => s.category === 'btc')?.color).toBe(
        UNIFIED_COLORS.BTC,
      );
      expect(result.find((s) => s.category === 'eth')?.color).toBe(
        UNIFIED_COLORS.ETH,
      );
      expect(result.find((s) => s.category === 'stable')?.color).toBe(
        UNIFIED_COLORS.STABLE,
      );
      expect(result.find((s) => s.category === 'alt')?.color).toBe(
        UNIFIED_COLORS.ALT,
      );
    });
  });

  describe('mapAssetAllocationToUnified', () => {
    it('maps explicit four-bucket ratios to unified segments', () => {
      const result = mapAssetAllocationToUnified({
        btc: 0.4,
        eth: 0.2,
        stable: 0.3,
        alt: 0.1,
      });

      expect(result).toHaveLength(4);
      expect(result.find((s) => s.category === 'btc')?.percentage).toBe(40);
      expect(result.find((s) => s.category === 'eth')?.percentage).toBe(20);
      expect(result.find((s) => s.category === 'stable')?.percentage).toBe(30);
      expect(result.find((s) => s.category === 'alt')?.percentage).toBe(10);
    });

    it('supports rendering a subset of categories', () => {
      const result = mapAssetAllocationToUnified(
        {
          btc: 0.4,
          eth: 0.2,
          stable: 0.4,
          alt: 0,
        },
        ['btc', 'eth', 'stable'],
      );

      expect(result.map((segment) => segment.category)).toEqual([
        'btc',
        'stable',
        'eth',
      ]);
      expect(
        result.find((segment) => segment.category === 'alt'),
      ).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // mapStrategyToUnified
  // ─────────────────────────────────────────────────────────────────────────

  describe('mapStrategyToUnified', () => {
    it('maps strategy buckets to unified segments', () => {
      const result = mapStrategyToUnified({
        spot: 0.5,
        lp: 0.3,
        stable: 0.2,
      });

      expect(result).toHaveLength(3);
      expect(result.find((s) => s.category === 'btc')?.percentage).toBe(50);
      expect(result.find((s) => s.category === 'alt')?.percentage).toBe(30);
      expect(result.find((s) => s.category === 'stable')?.percentage).toBe(20);
    });

    it('converts ratios to percentages', () => {
      const result = mapStrategyToUnified({
        spot: 0.75,
        lp: 0.25,
        stable: 0,
      });

      expect(result.find((s) => s.category === 'btc')?.percentage).toBe(75);
      expect(result.find((s) => s.category === 'alt')?.percentage).toBe(25);
    });

    it('filters zero values', () => {
      const result = mapStrategyToUnified({
        spot: 1.0,
        lp: 0,
        stable: 0,
      });

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('btc');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // mapBacktestToUnified
  // ─────────────────────────────────────────────────────────────────────────

  describe('mapBacktestToUnified', () => {
    it('maps backtest constituents with record breakdown', () => {
      const result = mapBacktestToUnified({
        spot: { btc: 3000, eth: 2000 },
        lp: { btc: 1000, eth: 500 },
        stable: 3500,
      });

      // Total = 3000 + 2000 + 1000 + 500 + 3500 = 10000
      expect(result.find((s) => s.category === 'btc')?.percentage).toBeCloseTo(
        40, // (3000 + 1000) / 10000
      );
      expect(result.find((s) => s.category === 'eth')?.percentage).toBeCloseTo(
        25, // (2000 + 500) / 10000
      );
      expect(
        result.find((s) => s.category === 'stable')?.percentage,
      ).toBeCloseTo(35);
      expect(result.find((s) => s.category === 'alt')).toBeUndefined();
    });

    it('handles plain number spot/lp values', () => {
      const result = mapBacktestToUnified({
        spot: 5000,
        lp: 2000,
        stable: 3000,
      });

      // When spot/lp are numbers, they go to "others" → ALT
      // Total = 5000 + 2000 + 3000 = 10000
      expect(result.find((s) => s.category === 'stable')?.percentage).toBe(30);
      // spot + lp → alt (since no btc/eth breakdown)
      expect(result.find((s) => s.category === 'alt')?.percentage).toBe(70);
    });

    it('returns empty array for zero total', () => {
      const result = mapBacktestToUnified({
        spot: 0,
        lp: 0,
        stable: 0,
      });

      expect(result).toHaveLength(0);
    });

    it('categorizes BTC-LP under BTC', () => {
      const result = mapBacktestToUnified({
        spot: { btc: 5000 },
        lp: { btc: 3000 }, // BTC-USDC LP
        stable: 2000,
      });

      expect(result.find((s) => s.category === 'btc')).toBeDefined();
      expect(result.find((s) => s.category === 'btc')?.percentage).toBeCloseTo(
        80,
      );
    });

    it('categorizes ETH and ETH-LP under ETH', () => {
      const result = mapBacktestToUnified({
        spot: { eth: 4000 },
        lp: { eth: 2000 }, // ETH-USDC LP
        stable: 4000,
      });

      expect(result.find((s) => s.category === 'eth')?.percentage).toBeCloseTo(
        60, // eth spot + eth lp
      );
      expect(result.find((s) => s.category === 'btc')).toBeUndefined(); // no BTC
      expect(result.find((s) => s.category === 'alt')).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // mapLegacyConstituentsToUnified
  // ─────────────────────────────────────────────────────────────────────────

  describe('mapLegacyConstituentsToUnified', () => {
    it('maps legacy constituents to unified segments', () => {
      const result = mapLegacyConstituentsToUnified(
        [
          { symbol: 'BTC', value: 50, color: '#F7931A' },
          { symbol: 'ETH', value: 20, color: '#627EEA' },
          { symbol: 'SOL', value: 10, color: '#6B7280' },
        ],
        20,
      );

      expect(result.find((s) => s.category === 'btc')?.percentage).toBe(50);
      expect(result.find((s) => s.category === 'eth')?.percentage).toBe(20);
      expect(result.find((s) => s.category === 'alt')?.percentage).toBe(10);
      expect(result.find((s) => s.category === 'stable')?.percentage).toBe(20);
    });

    it('categorizes WBTC and cbBTC as BTC', () => {
      const result = mapLegacyConstituentsToUnified(
        [
          { symbol: 'WBTC', value: 30, color: '#F7931A' },
          { symbol: 'cbBTC', value: 20, color: '#F7931A' },
        ],
        50,
      );

      expect(result.find((s) => s.category === 'btc')?.percentage).toBe(50); // 30 + 20
    });

    it('handles empty crypto assets', () => {
      const result = mapLegacyConstituentsToUnified([], 100);

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('stable');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Helper Functions
  // ─────────────────────────────────────────────────────────────────────────

  describe('calculateTotalPercentage', () => {
    it('calculates total correctly', () => {
      const segments = mapPortfolioToUnified({
        btc: 40,
        eth: 30,
        others: 10,
        stablecoins: 20,
      });

      expect(calculateTotalPercentage(segments)).toBe(100);
    });
  });

  describe('getAllocationSummary', () => {
    it('returns human-readable summary', () => {
      const segments = mapPortfolioToUnified({
        btc: 50,
        eth: 0,
        others: 25,
        stablecoins: 25,
      });

      const summary = getAllocationSummary(segments);
      expect(summary).toContain('BTC 50%');
      expect(summary).toContain('STABLE 25%');
      expect(summary).toContain('ALT 25%');
    });
  });
});
