import { describe, expect, it } from 'vitest';

import {
  createHeroMetrics,
  formatTradeFrequency,
} from '@/components/wallet/portfolio/views/backtesting/components/backtestTerminalMetrics';
import type { BacktestStrategySummary } from '@/types/backtesting';

function createMockSummary(
  overrides: Partial<BacktestStrategySummary> = {},
): BacktestStrategySummary {
  return {
    strategy_id: 'dma_gated_fgi',
    display_name: 'DMA Gated FGI Default',
    signal_id: 'dma_gated_fgi',
    total_invested: 10000,
    final_value: 15000,
    roi_percent: 50,
    calmar_ratio: 1.24,
    max_drawdown_percent: -12.3,
    trade_count: 42,
    final_allocation: {
      spot: 0.7,
      stable: 0.3,
    },
    parameters: {},
    ...overrides,
  };
}

describe('createHeroMetrics', () => {
  it('returns an empty array for undefined strategy', () => {
    expect(createHeroMetrics(undefined)).toEqual([]);
  });

  it('returns ROI, CALMAR, and MAX DRAWDOWN metrics', () => {
    const metrics = createHeroMetrics(createMockSummary());

    expect(metrics.map((metric) => metric.label)).toEqual([
      'ROI',
      'CALMAR',
      'MAX DRAWDOWN',
    ]);
  });

  it('formats ROI with a sign and percentage', () => {
    const metrics = createHeroMetrics(createMockSummary({ roi_percent: 50.7 }));
    expect(metrics[0]).toMatchObject({
      label: 'ROI',
      value: '+50.7%',
      color: 'text-emerald-400',
    });
  });

  it('formats CALMAR to two decimals', () => {
    const metrics = createHeroMetrics(
      createMockSummary({ calmar_ratio: 1.236 }),
    );
    expect(metrics[1]).toMatchObject({
      label: 'CALMAR',
      value: '1.24',
      color: 'text-cyan-400',
    });
  });

  it('falls back to "N/A" when CALMAR is absent', () => {
    const metrics = createHeroMetrics(
      createMockSummary({ calmar_ratio: null }),
    );

    expect(metrics[1]).toMatchObject({
      label: 'CALMAR',
      value: 'N/A',
    });
  });

  it('formats MAX DRAWDOWN from the absolute drawdown percentage', () => {
    const metrics = createHeroMetrics(
      createMockSummary({ max_drawdown_percent: -18.456 }),
    );

    expect(metrics[2]).toMatchObject({
      label: 'MAX DRAWDOWN',
      value: '18.5%',
      color: 'text-rose-400',
    });
  });

  it('falls back to "N/A" when MAX DRAWDOWN is absent', () => {
    const metrics = createHeroMetrics(
      createMockSummary({ max_drawdown_percent: null }),
    );

    expect(metrics[2]).toMatchObject({
      label: 'MAX DRAWDOWN',
      value: 'N/A',
    });
  });
});

describe('formatTradeFrequency', () => {
  it('returns null for zero trades', () => {
    expect(formatTradeFrequency(0, 500)).toBeNull();
  });

  it('returns null for zero days', () => {
    expect(formatTradeFrequency(12, 0)).toBeNull();
  });

  it('returns average days between trades', () => {
    expect(formatTradeFrequency(12, 500)).toBe('1 trade every 42 days');
  });

  it("returns '1+ trades per day' for very active strategies", () => {
    expect(formatTradeFrequency(500, 100)).toBe('1+ trades per day');
  });

  it('handles exactly one trade per day', () => {
    expect(formatTradeFrequency(100, 100)).toBe('1+ trades per day');
  });
});
