import { describe, expect, it } from 'vitest';

import {
  getStrategyColor,
  getStrategyDisplayName,
} from '@/components/wallet/portfolio/views/backtesting/utils/strategyDisplay';

describe('strategyDisplay', () => {
  describe('getStrategyDisplayName', () => {
    it('returns display names for canonical strategies', () => {
      expect(getStrategyDisplayName('dca_classic')).toBe('DCA Classic');
      expect(getStrategyDisplayName('dma_gated_fgi')).toBe('DMA Gated FGI');
      expect(getStrategyDisplayName('dma_gated_fgi_default')).toBe(
        'DMA Gated FGI Default',
      );
    });

    it('formats unknown ids by replacing underscores with spaces', () => {
      expect(getStrategyDisplayName('custom_strategy_v2')).toBe(
        'custom strategy v2',
      );
    });
  });

  describe('getStrategyColor', () => {
    it('returns the DCA color for exact or partial dca ids', () => {
      expect(getStrategyColor('dca_classic')).toBe('#4b5563');
      expect(getStrategyColor('custom_dca_classic_variant')).toBe('#4b5563');
    });

    it('returns palette colors by index', () => {
      expect(getStrategyColor('any_strategy', 0)).toBe('#3b82f6');
      expect(getStrategyColor('another_strategy', 1)).toBe('#06b6d4');
    });

    it('wraps palette index when exceeding palette length', () => {
      // Palette has 13 entries, so index 13 wraps to 0
      expect(getStrategyColor('strat', 13)).toBe('#3b82f6');
    });

    it('uses a deterministic hash color without an index', () => {
      expect(getStrategyColor('dma_gated_fgi_default')).toBe(
        getStrategyColor('dma_gated_fgi_default'),
      );
    });
  });
});
