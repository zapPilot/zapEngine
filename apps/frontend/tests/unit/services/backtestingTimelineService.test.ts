import { describe, expect, it } from 'vitest';

import {
  CHART_POINT_LIMIT,
  sampleTimelineData,
} from '@/services/backtestingTimelineService';
import type { BacktestTimelinePoint } from '@/types/backtesting';

type DecisionAction =
  BacktestTimelinePoint['strategies'][string]['decision']['action'];

function createStrategyPoint(action: DecisionAction) {
  return {
    portfolio: {
      spot_usd: 6000,
      stable_usd: 4000,
      total_value: 10000,
      allocation: { spot: 0.6, stable: 0.4 },
    },
    signal: null,
    decision: {
      action,
      reason: action === 'hold' ? 'wait' : 'blocked_action',
      rule_group: action === 'hold' ? 'none' : 'dma_fgi',
      target_allocation: { spot: 0.6, stable: 0.4 },
      immediate: false,
    },
    execution: {
      event: null,
      transfers: [],
      blocked_reason: action === 'hold' ? null : 'cooldown_active',
      status: action === 'hold' ? 'no_action' : 'blocked',
      step_count: 0,
      steps_remaining: 0,
      interval_days: 0,
    },
  };
}

function createTimelinePoint(
  index: number,
  actions: Record<string, DecisionAction> = {
    dma_gated_fgi_default: 'hold',
  },
): BacktestTimelinePoint {
  const date = new Date('2024-01-01');
  date.setDate(date.getDate() + index);

  return {
    market: {
      date: date.toISOString().split('T')[0] ?? '2024-01-01',
      token_price: { btc: 50000 + index },
      sentiment: null,
      sentiment_label: null,
    },
    strategies: Object.fromEntries(
      Object.entries(actions).map(([strategyId, action]) => [
        strategyId,
        createStrategyPoint(action),
      ]),
    ),
  };
}

function buildTimeline(
  length: number,
  criticalActions: Record<number, Record<string, DecisionAction>> = {},
): BacktestTimelinePoint[] {
  return Array.from({ length }, (_, index) =>
    createTimelinePoint(index, criticalActions[index]),
  );
}

function datesFor(points: BacktestTimelinePoint[]): Set<string> {
  return new Set(points.map((point) => point.market.date));
}

describe('sampleTimelineData', () => {
  it('returns [] for empty or undefined input', () => {
    expect(sampleTimelineData(undefined)).toEqual([]);
    expect(sampleTimelineData([])).toEqual([]);
  });

  it('returns input unchanged when length is less than or equal to the cap', () => {
    const timeline = buildTimeline(CHART_POINT_LIMIT);

    expect(sampleTimelineData(timeline)).toBe(timeline);
  });

  it('preserves all action != hold points when they fit under the cap', () => {
    const actionIndices = [7, 25, 61, 119, 180];
    const timeline = buildTimeline(
      220,
      Object.fromEntries(
        actionIndices.map((index) => [
          index,
          { dma_gated_fgi_default: index % 2 === 0 ? 'buy' : 'sell' },
        ]),
      ),
    );

    const result = sampleTimelineData(timeline);
    const resultDates = datesFor(result);

    expect(result).toHaveLength(CHART_POINT_LIMIT);
    expect(resultDates.has(timeline[0]?.market.date ?? '')).toBe(true);
    expect(
      resultDates.has(timeline[timeline.length - 1]?.market.date ?? ''),
    ).toBe(true);
    for (const index of actionIndices) {
      expect(resultDates.has(timeline[index]?.market.date ?? '')).toBe(true);
    }
  });

  it('preserves every action != hold day even when critical count exceeds the cap', () => {
    const timeline = buildTimeline(
      200,
      Object.fromEntries(
        Array.from({ length: 200 }, (_, index) => [
          index,
          { dma_gated_fgi_default: 'buy' },
        ]),
      ),
    );

    const result = sampleTimelineData(timeline);

    expect(result).toHaveLength(200);
    for (let i = 0; i < timeline.length; i++) {
      expect(result[i]).toBe(timeline[i]);
    }
  });

  it('preserves an isolated action day in a long otherwise-hold timeline', () => {
    const actionIndex = 250;
    const timeline = buildTimeline(500, {
      [actionIndex]: { dma_gated_fgi_default: 'buy' },
    });

    const result = sampleTimelineData(timeline);

    const targetDate = timeline[actionIndex]?.market.date ?? '';
    expect(datesFor(result).has(targetDate)).toBe(true);
  });

  it('preserves every action day in a mixed dense-action timeline', () => {
    const buyIndices = Array.from({ length: 150 }, (_, index) => index);
    const timeline = buildTimeline(
      200,
      Object.fromEntries(
        buyIndices.map((index) => [
          index,
          { dma_gated_fgi_default: 'buy' as DecisionAction },
        ]),
      ),
    );

    const result = sampleTimelineData(timeline);
    const resultDates = datesFor(result);

    expect(result.length).toBeGreaterThan(CHART_POINT_LIMIT);
    for (const index of buyIndices) {
      expect(resultDates.has(timeline[index]?.market.date ?? '')).toBe(true);
    }
  });

  it('fills remaining slots with non-critical samples when critical count is below cap', () => {
    const actionIndices = [10, 100, 300];
    const timeline = buildTimeline(
      500,
      Object.fromEntries(
        actionIndices.map((index, i) => [
          index,
          { dma_gated_fgi_default: i % 2 === 0 ? 'buy' : 'sell' },
        ]),
      ),
    );

    const result = sampleTimelineData(timeline);
    const resultDates = datesFor(result);

    expect(result).toHaveLength(CHART_POINT_LIMIT);
    for (const index of actionIndices) {
      expect(resultDates.has(timeline[index]?.market.date ?? '')).toBe(true);
    }
  });

  it('falls back to even sampling when no critical points exist', () => {
    const timeline = buildTimeline(240);

    const result = sampleTimelineData(timeline);

    expect(result).toHaveLength(CHART_POINT_LIMIT);
    expect(result[0]).toBe(timeline[0]);
    expect(result[result.length - 1]).toBe(timeline[timeline.length - 1]);
  });

  it('handles single-strategy and multi-strategy points equivalently for the union rule', () => {
    const singleStrategyTimeline = buildTimeline(30, {
      7: { dma_gated_fgi_default: 'buy' },
    });
    const multiStrategyTimeline = buildTimeline(30, {
      7: {
        dca_classic: 'hold',
        dma_gated_fgi_default: 'hold',
        rotation_default: 'buy',
      },
    });

    const singleResult = sampleTimelineData(singleStrategyTimeline, 6);
    const multiResult = sampleTimelineData(multiStrategyTimeline, 6);

    expect(
      datesFor(singleResult).has(singleStrategyTimeline[7]?.market.date ?? ''),
    ).toBe(true);
    expect(
      datesFor(multiResult).has(multiStrategyTimeline[7]?.market.date ?? ''),
    ).toBe(true);
    expect(singleResult).toHaveLength(6);
    expect(multiResult).toHaveLength(6);
  });
});
