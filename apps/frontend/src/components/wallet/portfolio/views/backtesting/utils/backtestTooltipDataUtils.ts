import type { IndicatorKey } from '../components/backtestChartLegendData';
import type {
  BacktestTooltipProps,
  EventStrategiesRecord,
  ParsedTooltipData,
  ParsedTooltipSource,
  StrategiesRecord,
} from './backtestTooltipDataTypes';
import {
  appendBtcToDmaRatio,
  buildAllocations,
  buildTooltipSections,
  getOrderedStrategyIds,
} from './backtestTooltipSections';

export type {
  AllocationBlock,
  BacktestTooltipPayloadEntry,
  BacktestTooltipProps,
  DetailItem,
  EventItem,
  ParsedTooltipData,
  SignalItem,
  TooltipItem,
} from './backtestTooltipDataTypes';

const buildParsedTooltipData = ({
  payload,
  label,
  sortedStrategyIds,
}: ParsedTooltipSource): ParsedTooltipData | null => {
  if (payload.length === 0) {
    return null;
  }

  const firstPayload = payload[0]?.payload;
  const market = firstPayload?.['market'] as
    | { date?: string; sentiment_label?: string | null }
    | undefined;
  const eventStrategies = firstPayload?.['eventStrategies'] as
    | EventStrategiesRecord
    | undefined;
  const strategies = firstPayload?.['strategies'] as
    | StrategiesRecord
    | undefined;
  const orderedIds = getOrderedStrategyIds(strategies, sortedStrategyIds);
  const sections = buildTooltipSections(
    payload,
    eventStrategies,
    market?.sentiment_label ?? undefined,
    strategies,
    orderedIds,
  );
  const signals = appendBtcToDmaRatio(sections);

  return {
    dateStr: new Date(String(market?.date ?? label)).toLocaleDateString(),
    sections: {
      ...sections,
      signals,
      allocations: buildAllocations(orderedIds, strategies, sortedStrategyIds),
    },
  };
};

// =============================================================================
// INDICATOR FILTERING
// =============================================================================

/** Maps indicator keys to their signal names in tooltip payload. */
const INDICATOR_KEY_TO_SIGNAL_NAMES: Record<IndicatorKey, string[]> = {
  btcPrice: ['BTC Price'],
  dma200: ['DMA 200'],
  sentiment: ['Sentiment'],
};

/**
 * Builds tooltip data from Recharts payload, filtering signals based on active indicators.
 *
 * @param props - Tooltip props including payload, label, strategy IDs, and active indicators
 * @returns Parsed tooltip data or null when payload is empty/inactive
 *
 * @example
 * ```ts
 * const data = buildBacktestTooltipData({
 *   payload: rechartsPayload,
 *   label: "2026-01-15",
 *   sortedStrategyIds: ["dca_classic", "dma_gated_fgi"],
 *   activeIndicators: new Set(["btcPrice", "sentiment"]),
 * });
 * ```
 */
export function buildBacktestTooltipData({
  payload,
  label,
  sortedStrategyIds,
  activeIndicators,
}: BacktestTooltipProps): ParsedTooltipData | null {
  if (!payload || payload.length === 0) {
    return null;
  }

  const result = buildParsedTooltipData({
    payload,
    label,
    sortedStrategyIds,
  });

  if (!result || !activeIndicators) {
    return result;
  }

  const hiddenSignalNames = new Set<string>();
  for (const [key, names] of Object.entries(INDICATOR_KEY_TO_SIGNAL_NAMES)) {
    if (!activeIndicators.has(key as IndicatorKey)) {
      for (const name of names) {
        hiddenSignalNames.add(name);
      }
    }
  }

  if (hiddenSignalNames.size === 0) {
    return result;
  }

  result.sections.signals = result.sections.signals.filter(
    (signal) => !hiddenSignalNames.has(signal.name),
  );

  if (hiddenSignalNames.has('BTC Price') || hiddenSignalNames.has('DMA 200')) {
    result.sections.signals = result.sections.signals.filter(
      (signal) => signal.name !== 'BTC / DMA 200',
    );
  }

  return result;
}
