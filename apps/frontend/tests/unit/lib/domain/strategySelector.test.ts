import { describe, expect, it } from 'vitest';

import {
  computeStrategyDirection,
  getActiveStrategy,
  getRegimeName,
  getStrategyMeta,
  REGIME_ORDER,
} from '@/lib/domain/strategySelector';

describe('strategySelector', () => {
  describe('REGIME_ORDER', () => {
    it('orders regimes from bearish to bullish', () => {
      expect(REGIME_ORDER.ef).toBe(0);
      expect(REGIME_ORDER.f).toBe(1);
      expect(REGIME_ORDER.n).toBe(2);
      expect(REGIME_ORDER.g).toBe(3);
      expect(REGIME_ORDER.eg).toBe(4);
    });
  });

  describe('computeStrategyDirection', () => {
    it('returns default when no previous regime', () => {
      expect(computeStrategyDirection('n', null)).toBe('default');
    });

    it('returns fromLeft when moving toward bullish', () => {
      expect(computeStrategyDirection('g', 'n')).toBe('fromLeft');
      expect(computeStrategyDirection('eg', 'f')).toBe('fromLeft');
    });

    it('returns fromRight when moving toward bearish', () => {
      expect(computeStrategyDirection('f', 'g')).toBe('fromRight');
      expect(computeStrategyDirection('ef', 'n')).toBe('fromRight');
    });

    it('returns default when same regime', () => {
      expect(computeStrategyDirection('n', 'n')).toBe('default');
      expect(computeStrategyDirection('eg', 'eg')).toBe('default');
    });
  });

  describe('getActiveStrategy', () => {
    it('uses server direction when provided and not default', () => {
      expect(getActiveStrategy('fromLeft', 'n', 'f')).toBe('fromLeft');
      expect(getActiveStrategy('fromRight', 'n', 'g')).toBe('fromRight');
    });

    it('computes client-side when server direction is default', () => {
      expect(getActiveStrategy('default', 'g', 'n')).toBe('fromLeft');
    });

    it('computes client-side when server direction is undefined', () => {
      expect(getActiveStrategy(undefined, 'f', 'g')).toBe('fromRight');
    });

    it('returns default when no previous regime and no server direction', () => {
      expect(getActiveStrategy(undefined, 'n', null)).toBe('default');
    });
  });

  describe('getStrategyMeta', () => {
    it('returns fromLeft meta', () => {
      const meta = getStrategyMeta('fromLeft');
      expect(meta.animationClass).toBe('slide-from-left');
      expect(meta.description).toBe('Increasing crypto allocation');
    });

    it('returns fromRight meta', () => {
      const meta = getStrategyMeta('fromRight');
      expect(meta.animationClass).toBe('slide-from-right');
    });

    it('returns default meta', () => {
      const meta = getStrategyMeta('default');
      expect(meta.animationClass).toBe('fade-in');
    });
  });

  describe('getRegimeName', () => {
    it('returns human-readable regime names', () => {
      expect(getRegimeName('ef')).toBe('Extreme Fear');
      expect(getRegimeName('n')).toBe('Neutral');
      expect(getRegimeName('eg')).toBe('Extreme Greed');
    });
  });
});
