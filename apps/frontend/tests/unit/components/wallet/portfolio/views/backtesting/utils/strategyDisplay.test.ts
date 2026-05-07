import { describe, expect, it } from 'vitest';

import {
  getStrategyColor,
  getStrategyDisplayName,
} from '@/components/wallet/portfolio/views/backtesting/utils/strategyDisplay';

describe('strategyDisplay', () => {
  describe('getStrategyDisplayName', () => {
    it('returns display names for canonical strategies', () => {
      expect(getStrategyDisplayName('eth_btc_rotation')).toBe(
        'ETH/BTC Rotation',
      );
      expect(getStrategyDisplayName('eth_btc_rotation_default')).toBe(
        'ETH/BTC Rotation Default',
      );
      expect(getStrategyDisplayName('dma_fgi_hierarchical_minimum')).toBe(
        'Hierarchical Minimum',
      );
    });

    it('formats unknown ids by replacing underscores with spaces', () => {
      expect(getStrategyDisplayName('custom_strategy_v2')).toBe(
        'custom strategy v2',
      );
    });
  });

  describe('getStrategyColor', () => {
    it('returns palette colors by index', () => {
      expect(getStrategyColor('any_strategy', 0)).toBe('#3b82f6');
      expect(getStrategyColor('another_strategy', 1)).toBe('#06b6d4');
    });

    it('wraps palette index when exceeding palette length', () => {
      // Palette has 13 entries, so index 13 wraps to 0
      expect(getStrategyColor('strat', 13)).toBe('#3b82f6');
    });

    it('uses a deterministic hash color without an index', () => {
      expect(getStrategyColor('eth_btc_rotation_default')).toBe(
        getStrategyColor('eth_btc_rotation_default'),
      );
    });
  });
});
