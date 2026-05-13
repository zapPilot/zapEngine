import { describe, expect, it } from 'vitest';
import {
  formatMetricPercent,
  formatPercentagePoint,
  formatRatio,
  getBacktestSnapshot,
} from '../snapshot';

describe('snapshot formatters', () => {
  describe('formatMetricPercent', () => {
    it('formats positive values with percent sign', () => {
      expect(formatMetricPercent(71.7135)).toBe('71.71%');
    });

    it('formats negative values with sign preserved', () => {
      expect(formatMetricPercent(-9.3248)).toBe('-9.32%');
    });

    it('rounds to two decimals using JavaScript fixed-point behavior', () => {
      expect(formatMetricPercent(1.005)).toBe('1.00%');
    });
  });

  describe('formatPercentagePoint', () => {
    it('prefixes positive values with plus', () => {
      expect(formatPercentagePoint(86.07)).toBe('+86.07pp');
    });

    it('keeps negative sign without extra plus', () => {
      expect(formatPercentagePoint(-22.05)).toBe('-22.05pp');
    });

    it('does not prefix zero', () => {
      expect(formatPercentagePoint(0)).toBe('0.00pp');
    });
  });

  describe('formatRatio', () => {
    it('formats positive ratios to two decimals', () => {
      expect(formatRatio(5.006)).toBe('5.01');
    });

    it('formats negative ratios to two decimals', () => {
      expect(formatRatio(-0.254)).toBe('-0.25');
    });
  });

  describe('getBacktestSnapshot', () => {
    it('reads default strategy id and formatted shape', () => {
      const snap = getBacktestSnapshot();

      expect(snap.strategyId).toBe('dma_fgi_portfolio_rules');
      expect(snap.raw.tradeCount).toBeGreaterThan(0);
      expect(snap.roiPercent).toMatch(/^-?\d+\.\d{2}%$/);
      expect(snap.calmarRatio).toMatch(/^-?\d+\.\d{2}$/);
    });
  });
});
