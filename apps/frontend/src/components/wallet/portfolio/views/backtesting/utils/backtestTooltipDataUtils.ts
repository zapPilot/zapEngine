import type {
  BacktestTooltipProps,
  EventStrategiesRecord,
  ParsedTooltipData,
  ParsedTooltipSource,
  StrategiesRecord,
} from './backtestTooltipDataTypes';
import {
  buildAllocations,
  buildTooltipSections,
  getOrderedStrategyIds,
} from './backtestTooltipSections';

export type {
  AllocationBlock,
  BacktestTooltipPayloadEntry,
  BacktestTooltipProps,
  DecisionActionItem,
  DecisionAssetChangeItem,
  DecisionAssetChangeNote,
  DecisionRuleItem,
  DecisionSummary,
  EventItem,
  ParsedTooltipData,
  TooltipItem,
} from './backtestTooltipDataTypes';

const buildParsedTooltipData = ({
  payload,
  label,
  sortedStrategyIds,
  chartDataIndex,
}: ParsedTooltipSource): ParsedTooltipData | null => {
  if (payload.length === 0) {
    return null;
  }

  const firstPayload = payload[0]?.payload;
  const dateKey = typeof label === 'string' ? label : firstPayload?.['date'];
  const fullPoint = dateKey ? chartDataIndex?.get(String(dateKey)) : undefined;
  const market = fullPoint?.market;
  const eventStrategies = firstPayload?.['eventStrategies'] as
    | EventStrategiesRecord
    | undefined;
  const strategies = fullPoint?.strategies as StrategiesRecord | undefined;
  const orderedIds = getOrderedStrategyIds(strategies, sortedStrategyIds);
  const sections = buildTooltipSections(
    payload,
    eventStrategies,
    strategies,
    orderedIds,
  );

  return {
    dateStr: new Date(String(market?.date ?? label)).toLocaleDateString(),
    sections: {
      ...sections,
      allocations: buildAllocations(orderedIds, strategies, sortedStrategyIds),
    },
  };
};

/**
 * Builds tooltip data from Recharts payload.
 *
 * @param props - Tooltip props including payload, label, and strategy IDs
 * @returns Parsed tooltip data or null when payload is empty/inactive
 *
 * @example
 * ```ts
 * const data = buildBacktestTooltipData({
 *   payload: rechartsPayload,
 *   label: "2026-01-15",
 *   sortedStrategyIds: ["dma_fgi_hierarchical_minimum", "dma_fgi_portfolio_rules"],
 * });
 * ```
 */
export function buildBacktestTooltipData({
  payload,
  label,
  sortedStrategyIds,
  chartDataIndex,
}: BacktestTooltipProps): ParsedTooltipData | null {
  if (!payload || payload.length === 0) {
    return null;
  }

  return buildParsedTooltipData({
    payload,
    label,
    sortedStrategyIds,
    chartDataIndex,
  });
}
