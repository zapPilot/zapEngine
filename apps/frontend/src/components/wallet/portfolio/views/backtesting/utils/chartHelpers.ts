import type {
  BacktestBucket,
  BacktestTimelinePoint,
} from '@/types/backtesting';

import { getBacktestTransferDirection } from '../backtestBuckets';
import {
  DCA_BASELINE_SPARSE_STRIDE,
  DCA_CLASSIC_STRATEGY_ID,
} from '../constants';
import { getBacktestSpotAssetColor } from './spotAssetDisplay';
import { getStrategyDisplayName } from './strategyDisplay';

export type SignalKey =
  | 'buy_spot'
  | 'sell_spot'
  | 'switch_to_eth'
  | 'switch_to_btc'
  | 'switch_to_spy';

export interface SignalConfig {
  key: SignalKey;
  field: string;
  name: string;
  color: string;
  shape:
    | 'circle'
    | 'cross'
    | 'diamond'
    | 'square'
    | 'star'
    | 'triangle'
    | 'wye';
}

export interface BacktestChartPoint extends Record<string, unknown> {
  date: string;
  buySpotSignal: number | null;
  sellSpotSignal: number | null;
  switchToEthSignal: number | null;
  switchToBtcSignal: number | null;
  switchToSpySignal: number | null;
  eventStrategies: Record<SignalKey, string[]>;
}

/** Unified signal configuration */
export const CHART_SIGNALS: SignalConfig[] = [
  {
    key: 'buy_spot',
    field: 'buySpotSignal',
    name: 'Buy Spot',
    color: '#22c55e',
    shape: 'circle',
  },
  {
    key: 'sell_spot',
    field: 'sellSpotSignal',
    name: 'Sell Spot',
    color: '#ef4444',
    shape: 'circle',
  },
  {
    key: 'switch_to_eth',
    field: 'switchToEthSignal',
    name: 'Switch to ETH',
    color: getBacktestSpotAssetColor('ETH'),
    shape: 'diamond',
  },
  {
    key: 'switch_to_btc',
    field: 'switchToBtcSignal',
    name: 'Switch to BTC',
    color: getBacktestSpotAssetColor('BTC'),
    shape: 'diamond',
  },
  {
    key: 'switch_to_spy',
    field: 'switchToSpySignal',
    name: 'Switch to SPY',
    color: getBacktestSpotAssetColor('SPY'),
    shape: 'diamond',
  },
];

const SIGNAL_FIELDS = CHART_SIGNALS.map((s) => s.field);
const MS_PER_DAY = 86_400_000;
const DEFAULT_Y_DOMAIN: [number, number] = [0, 1000];
const Y_AXIS_PADDING_FACTOR = 0.05;

interface SignalAccumulator {
  [key: string]: number | null | Record<SignalKey, string[]>;
  eventStrategies: Record<SignalKey, string[]>;
}

type BacktestStrategy = NonNullable<
  BacktestTimelinePoint['strategies'][string]
>;

interface SparseContext {
  pointIndex: number;
  totalPoints: number;
}

function classifyTransfer(
  from: BacktestBucket,
  to: BacktestBucket,
): SignalKey | null {
  const direction = getBacktestTransferDirection(from, to);

  if (direction === 'stable_to_spot') {
    return 'buy_spot';
  }

  if (direction === 'spot_to_stable') {
    return 'sell_spot';
  }

  if (from === 'btc' && to === 'eth') {
    return 'switch_to_eth';
  }

  if (from === 'eth' && to === 'btc') {
    return 'switch_to_btc';
  }

  if ((from === 'btc' || from === 'eth') && to === 'spy') {
    return 'switch_to_spy';
  }

  if (from === 'spy' && to === 'btc') {
    return 'switch_to_btc';
  }

  if (from === 'spy' && to === 'eth') {
    return 'switch_to_eth';
  }

  return null;
}

function updateSignal(
  acc: SignalAccumulator,
  signalKey: SignalKey,
  portfolioValue: number,
  displayName: string,
): void {
  const config = CHART_SIGNALS.find((s) => s.key === signalKey);
  if (!config) return;

  const current = acc[config.field] as number | null;
  acc[config.field] =
    current == null ? portfolioValue : Math.max(current, portfolioValue);

  const strategies = acc.eventStrategies[signalKey];
  if (!strategies.includes(displayName)) {
    strategies.push(displayName);
  }
}

function getTransfers(
  strategy: BacktestStrategy,
): BacktestStrategy['execution']['transfers'] {
  return strategy.execution.transfers ?? [];
}

function forEachActiveStrategy(
  point: BacktestTimelinePoint,
  strategyIds: string[],
  callback: (strategyId: string, strategy: BacktestStrategy) => void,
): void {
  for (const strategyId of strategyIds) {
    if (strategyId === DCA_CLASSIC_STRATEGY_ID) {
      continue;
    }

    const strategy = point.strategies[strategyId];
    if (!strategy) {
      continue;
    }

    callback(strategyId, strategy);
  }
}

function processStrategyTransfers(
  point: BacktestTimelinePoint,
  strategyIds: string[],
  acc: SignalAccumulator,
): void {
  forEachActiveStrategy(point, strategyIds, (strategyId, strategy) => {
    const displayName = getStrategyDisplayName(strategyId);

    for (const transfer of getTransfers(strategy)) {
      const signalKey = classifyTransfer(
        transfer.from_bucket,
        transfer.to_bucket,
      );
      if (!signalKey) {
        continue;
      }

      updateSignal(acc, signalKey, strategy.portfolio.total_value, displayName);
    }
  });
}

function createSignalAccumulator(): SignalAccumulator {
  const acc: SignalAccumulator = {
    eventStrategies: {} as Record<SignalKey, string[]>,
  };

  for (const s of CHART_SIGNALS) {
    acc[s.field] = null;
    acc.eventStrategies[s.key] = [];
  }

  return acc;
}

function getPointValues(
  point: Record<string, unknown>,
  strategyIds: string[],
): number[] {
  const keys = [...strategyIds.map((id) => `${id}_value`), ...SIGNAL_FIELDS];
  const values: number[] = [];

  for (const key of keys) {
    const value = point[key];
    if (typeof value === 'number') {
      values.push(value);
    }
  }

  return values;
}

export function calculateYAxisDomain(
  chartData: Record<string, unknown>[],
  strategyIds: string[],
): [number, number] {
  if (!chartData.length) return DEFAULT_Y_DOMAIN;

  let min = Infinity;
  let max = -Infinity;

  for (const point of chartData) {
    const values = getPointValues(point, strategyIds);
    if (values.length > 0) {
      min = Math.min(min, ...values);
      max = Math.max(max, ...values);
    }
  }

  if (min === Infinity || max === -Infinity) return DEFAULT_Y_DOMAIN;

  const padding = (max - min) * Y_AXIS_PADDING_FACTOR;
  return [Math.max(0, min - padding), max + padding];
}

export function calculateActualDays(timeline: BacktestTimelinePoint[]): number {
  if (timeline.length < 2) return 0;

  const firstPoint = timeline[0];
  const lastPoint = timeline[timeline.length - 1];

  if (!firstPoint || !lastPoint) return 0;

  const start = new Date(firstPoint.market.date).getTime();
  const end = new Date(lastPoint.market.date).getTime();

  return Math.ceil(Math.abs(end - start) / MS_PER_DAY) + 1;
}

export function getPrimaryStrategyId(sortedIds: string[]): string | null {
  return (
    sortedIds.find((id) => id !== DCA_CLASSIC_STRATEGY_ID) ??
    sortedIds[0] ??
    null
  );
}

/**
 * Filters sorted strategy IDs to the DCA baseline plus the primary strategy.
 *
 * @param sortedIds - Strategy IDs already sorted by `sortStrategyIds`
 * @returns Array with at most 2 IDs: [dca_classic, primaryStrategy]
 */
export function filterToActiveStrategies(sortedIds: string[]): string[] {
  const primary = getPrimaryStrategyId(sortedIds);
  if (!primary) return sortedIds;

  const result: string[] = [];
  if (sortedIds.includes(DCA_CLASSIC_STRATEGY_ID)) {
    result.push(DCA_CLASSIC_STRATEGY_ID);
  }
  if (primary !== DCA_CLASSIC_STRATEGY_ID) {
    result.push(primary);
  }

  return result;
}

export function sortStrategyIds(ids: string[]): string[] {
  const dca: string[] = [];
  if (ids.includes(DCA_CLASSIC_STRATEGY_ID)) {
    dca.push(DCA_CLASSIC_STRATEGY_ID);
  }

  const others = ids
    .filter((id) => id !== DCA_CLASSIC_STRATEGY_ID)
    .sort((a, b) =>
      getStrategyDisplayName(a).localeCompare(getStrategyDisplayName(b)),
    );

  return [...dca, ...others];
}

function shouldSparseDcaPoint(
  strategyId: string,
  sparseContext: SparseContext | undefined,
): boolean {
  return (
    strategyId === DCA_CLASSIC_STRATEGY_ID &&
    sparseContext !== undefined &&
    sparseContext.pointIndex !== 0 &&
    sparseContext.pointIndex !== sparseContext.totalPoints - 1 &&
    sparseContext.pointIndex % DCA_BASELINE_SPARSE_STRIDE !== 0
  );
}

export function buildChartPoint(
  point: BacktestTimelinePoint,
  strategyIds: string[],
  sparseContext?: SparseContext,
): BacktestChartPoint {
  const data: BacktestChartPoint = {
    date: point.market.date,
    buySpotSignal: null,
    sellSpotSignal: null,
    switchToEthSignal: null,
    switchToBtcSignal: null,
    switchToSpySignal: null,
    eventStrategies: {
      buy_spot: [],
      sell_spot: [],
      switch_to_eth: [],
      switch_to_btc: [],
      switch_to_spy: [],
    },
  };

  for (const id of strategyIds) {
    const strategy = point.strategies[id];
    if (strategy) {
      data[`${id}_value`] = shouldSparseDcaPoint(id, sparseContext)
        ? null
        : strategy.portfolio.total_value;
    }
  }

  const acc = createSignalAccumulator();
  processStrategyTransfers(point, strategyIds, acc);

  for (const signal of CHART_SIGNALS) {
    data[signal.field] = acc[signal.field];
  }
  data['eventStrategies'] = acc.eventStrategies;

  return data;
}
