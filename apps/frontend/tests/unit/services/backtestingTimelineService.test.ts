import { describe, expect, it } from 'vitest';

import {
  CHART_POINT_LIMIT,
  sampleTimelineData,
} from '@/services/backtestingTimelineService';
import type {
  BacktestExecution,
  BacktestTimelinePoint,
} from '@/types/backtesting';

type DecisionAction =
  BacktestTimelinePoint['strategies'][string]['decision']['action'];

const PRIMARY_STRATEGY_ID = 'dma_gated_fgi_default';
const DCA_STRATEGY_ID = 'dca_classic';

function noActionExecution(): BacktestExecution {
  return {
    event: null,
    transfers: [],
    blocked_reason: null,
    status: 'no_action',
    action_required: false,
    step_count: 0,
    steps_remaining: 0,
    interval_days: 0,
    diagnostics: {
      plugins: {},
    },
  };
}

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

function withPrimaryNoActionSellIntent(
  point: BacktestTimelinePoint,
  strategyId: string = PRIMARY_STRATEGY_ID,
): BacktestTimelinePoint {
  const strategy = point.strategies[strategyId];
  if (!strategy) {
    return point;
  }

  return {
    ...point,
    strategies: {
      ...point.strategies,
      [strategyId]: {
        ...strategy,
        decision: {
          ...strategy.decision,
          action: 'sell',
          reason: 'portfolio_dma_overextension_dca_sell',
          rule_group: 'dma_fgi',
        },
        execution: noActionExecution(),
      },
    },
  };
}

function createTimelinePoint(
  index: number,
  actions: Record<string, DecisionAction> = {
    [PRIMARY_STRATEGY_ID]: 'hold',
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

function withPrimaryTransfer(
  point: BacktestTimelinePoint,
  strategyId: string = PRIMARY_STRATEGY_ID,
): BacktestTimelinePoint {
  const strategy = point.strategies[strategyId];
  if (!strategy) {
    return point;
  }

  return {
    ...point,
    strategies: {
      ...point.strategies,
      [strategyId]: {
        ...strategy,
        execution: {
          ...strategy.execution,
          event: 'rebalance',
          transfers: [
            {
              from_bucket: 'stable',
              to_bucket: 'spot',
              amount_usd: 123,
            },
          ],
          blocked_reason: null,
          status: 'action_required',
        },
      },
    },
  };
}

function datesFor(points: BacktestTimelinePoint[]): Set<string> {
  return new Set(points.map((point) => point.market.date));
}

describe('sampleTimelineData', () => {
  it('returns [] for empty or undefined input', () => {
    expect(sampleTimelineData(undefined, PRIMARY_STRATEGY_ID)).toEqual([]);
    expect(sampleTimelineData([], PRIMARY_STRATEGY_ID)).toEqual([]);
  });

  it('returns input unchanged when length is less than or equal to the cap', () => {
    const timeline = buildTimeline(CHART_POINT_LIMIT);

    expect(sampleTimelineData(timeline, PRIMARY_STRATEGY_ID)).toBe(timeline);
  });

  it('preserves all primary transfer points when they fit under the cap', () => {
    const transferIndices = [7, 25, 61, 119, 180];
    const timeline = buildTimeline(
      220,
      Object.fromEntries(
        transferIndices.map((index) => [
          index,
          { [PRIMARY_STRATEGY_ID]: index % 2 === 0 ? 'buy' : 'sell' },
        ]),
      ),
    ).map((point, index) =>
      transferIndices.includes(index) ? withPrimaryTransfer(point) : point,
    );

    const result = sampleTimelineData(timeline, PRIMARY_STRATEGY_ID);
    const resultDates = datesFor(result);

    expect(result).toHaveLength(CHART_POINT_LIMIT);
    expect(resultDates.has(timeline[0]?.market.date ?? '')).toBe(true);
    expect(
      resultDates.has(timeline[timeline.length - 1]?.market.date ?? ''),
    ).toBe(true);
    for (const index of transferIndices) {
      expect(resultDates.has(timeline[index]?.market.date ?? '')).toBe(true);
    }
  });

  it('preserves every primary transfer day even when critical count exceeds the cap', () => {
    const timeline = buildTimeline(
      200,
      Object.fromEntries(
        Array.from({ length: 200 }, (_, index) => [
          index,
          { [PRIMARY_STRATEGY_ID]: 'buy' },
        ]),
      ),
    ).map((point) => withPrimaryTransfer(point));

    const result = sampleTimelineData(timeline, PRIMARY_STRATEGY_ID);

    expect(result).toHaveLength(200);
    for (let i = 0; i < timeline.length; i++) {
      expect(result[i]).toBe(timeline[i]);
    }
  });

  it('does not preserve no-action primary intent days without transfers', () => {
    const noActionIntentIndex = 7;
    const timeline = buildTimeline(30).map((point, index) =>
      index === noActionIntentIndex
        ? withPrimaryNoActionSellIntent(point)
        : point,
    );

    const result = sampleTimelineData(timeline, PRIMARY_STRATEGY_ID, 6);
    const resultDates = datesFor(result);

    expect(
      resultDates.has(timeline[noActionIntentIndex]?.market.date ?? ''),
    ).toBe(false);
  });

  it('preserves an isolated transfer day in a long otherwise-hold timeline', () => {
    const transferIndex = 250;
    const timeline = buildTimeline(500, {
      [transferIndex]: { [PRIMARY_STRATEGY_ID]: 'buy' },
    }).map((point, index) =>
      index === transferIndex ? withPrimaryTransfer(point) : point,
    );

    const result = sampleTimelineData(timeline, PRIMARY_STRATEGY_ID);

    const targetDate = timeline[transferIndex]?.market.date ?? '';
    expect(datesFor(result).has(targetDate)).toBe(true);
  });

  it('preserves every transfer day in a mixed dense-action timeline', () => {
    const transferIndices = Array.from({ length: 150 }, (_, index) => index);
    const timeline = buildTimeline(
      200,
      Object.fromEntries(
        transferIndices.map((index) => [
          index,
          { [PRIMARY_STRATEGY_ID]: 'buy' as DecisionAction },
        ]),
      ),
    ).map((point, index) =>
      transferIndices.includes(index) ? withPrimaryTransfer(point) : point,
    );

    const result = sampleTimelineData(timeline, PRIMARY_STRATEGY_ID);
    const resultDates = datesFor(result);

    expect(result.length).toBeGreaterThan(CHART_POINT_LIMIT);
    for (const index of transferIndices) {
      expect(resultDates.has(timeline[index]?.market.date ?? '')).toBe(true);
    }
  });

  it('fills remaining slots with non-critical samples when critical count is below cap', () => {
    const transferIndices = [10, 100, 300];
    const timeline = buildTimeline(
      500,
      Object.fromEntries(
        transferIndices.map((index, i) => [
          index,
          { [PRIMARY_STRATEGY_ID]: i % 2 === 0 ? 'buy' : 'sell' },
        ]),
      ),
    ).map((point, index) =>
      transferIndices.includes(index) ? withPrimaryTransfer(point) : point,
    );

    const result = sampleTimelineData(timeline, PRIMARY_STRATEGY_ID);
    const resultDates = datesFor(result);

    expect(result).toHaveLength(CHART_POINT_LIMIT);
    for (const index of transferIndices) {
      expect(resultDates.has(timeline[index]?.market.date ?? '')).toBe(true);
    }
  });

  it('falls back to even sampling when no critical points exist', () => {
    const timeline = buildTimeline(240);

    const result = sampleTimelineData(timeline, PRIMARY_STRATEGY_ID);

    expect(result).toHaveLength(CHART_POINT_LIMIT);
    expect(result[0]).toBe(timeline[0]);
    expect(result[result.length - 1]).toBe(timeline[timeline.length - 1]);
  });

  it("ignores DCA Classic's high-frequency actions when computing critical points", () => {
    const timeline = buildTimeline(
      200,
      Object.fromEntries(
        Array.from({ length: 200 }, (_, index) => [
          index,
          { [DCA_STRATEGY_ID]: 'buy', [PRIMARY_STRATEGY_ID]: 'hold' },
        ]),
      ),
    );

    const result = sampleTimelineData(timeline, PRIMARY_STRATEGY_ID);

    expect(result).toHaveLength(CHART_POINT_LIMIT);
    expect(result[0]).toBe(timeline[0]);
    expect(result[result.length - 1]).toBe(timeline[timeline.length - 1]);
  });

  it('falls back to even sampling when primary strategy id is null', () => {
    const timeline = buildTimeline(
      240,
      Object.fromEntries(
        Array.from({ length: 240 }, (_, index) => [
          index,
          { [PRIMARY_STRATEGY_ID]: 'buy' },
        ]),
      ),
    );

    const result = sampleTimelineData(timeline, null);

    expect(result).toHaveLength(CHART_POINT_LIMIT);
    expect(result[0]).toBe(timeline[0]);
    expect(result[result.length - 1]).toBe(timeline[timeline.length - 1]);
  });

  it('uses only the selected primary strategy when detecting critical points', () => {
    const singleStrategyTimeline = buildTimeline(30, {
      7: { [PRIMARY_STRATEGY_ID]: 'buy' },
    }).map((point, index) =>
      index === 7 ? withPrimaryTransfer(point) : point,
    );
    const multiStrategyTimeline = buildTimeline(30, {
      7: {
        [DCA_STRATEGY_ID]: 'hold',
        [PRIMARY_STRATEGY_ID]: 'hold',
        rotation_default: 'buy',
      },
    }).map((point, index) =>
      index === 7 ? withPrimaryTransfer(point, 'rotation_default') : point,
    );

    const singleResult = sampleTimelineData(
      singleStrategyTimeline,
      PRIMARY_STRATEGY_ID,
      6,
    );
    const multiResultWithRotationPrimary = sampleTimelineData(
      multiStrategyTimeline,
      'rotation_default',
      6,
    );
    const multiResultWithDefaultPrimary = sampleTimelineData(
      multiStrategyTimeline,
      PRIMARY_STRATEGY_ID,
      6,
    );

    expect(
      datesFor(singleResult).has(singleStrategyTimeline[7]?.market.date ?? ''),
    ).toBe(true);
    expect(
      datesFor(multiResultWithRotationPrimary).has(
        multiStrategyTimeline[7]?.market.date ?? '',
      ),
    ).toBe(true);
    expect(
      datesFor(multiResultWithDefaultPrimary).has(
        multiStrategyTimeline[7]?.market.date ?? '',
      ),
    ).toBe(false);
    expect(singleResult).toHaveLength(6);
    expect(multiResultWithRotationPrimary).toHaveLength(6);
    expect(multiResultWithDefaultPrimary).toHaveLength(6);
  });
});
