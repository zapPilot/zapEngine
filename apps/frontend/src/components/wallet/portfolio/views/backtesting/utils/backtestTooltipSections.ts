import { formatCurrency } from "@/utils";

import { hasBacktestAllocation } from "../backtestBuckets";
import type {
  AllocationBlock,
  BacktestTooltipPayloadEntry,
  DetailItem,
  EventItem,
  EventStrategiesRecord,
  SignalItem,
  StrategiesRecord,
  TooltipItem,
  TooltipSections,
} from "./backtestTooltipDataTypes";
import { CHART_SIGNALS } from "./chartHelpers";
import {
  getBacktestSpotAssetColor,
  resolveBacktestSpotAsset,
} from "./spotAssetDisplay";
import { getStrategyDisplayName } from "./strategyDisplay";

const SIGNAL_EVENT_KEYS = new Set<string>([
  "buy_spot",
  "sell_spot",
  "switch_to_eth",
  "switch_to_btc",
]);

const SIGNAL_TO_EVENT_KEY: Record<string, string> = Object.fromEntries(
  CHART_SIGNALS.filter(signal => SIGNAL_EVENT_KEYS.has(signal.key)).map(
    signal => [signal.name, signal.key]
  )
);

function buildAllocationBlock(
  strategyId: string,
  strategies: StrategiesRecord | undefined,
  sortedStrategyIds: string[] | undefined
): AllocationBlock | null {
  const strategy = strategies?.[strategyId];
  const allocation = strategy?.portfolio?.allocation;
  if (!allocation || !hasBacktestAllocation(allocation)) {
    return null;
  }

  const spotAssetLabel = resolveBacktestSpotAsset(strategy);

  return {
    id: strategyId,
    displayName: getStrategyDisplayName(strategyId),
    allocation,
    assetAllocation: strategy.portfolio.asset_allocation,
    index: sortedStrategyIds?.indexOf(strategyId),
    ...(spotAssetLabel ? { spotAssetLabel } : {}),
  };
}

function getBuyGateBlockReason(
  strategy: StrategiesRecord[string]
): string | null {
  const plugin = strategy.execution.diagnostics?.plugins?.["dma_buy_gate"];
  if (!plugin || typeof plugin !== "object") {
    return null;
  }

  const blockReason = plugin["block_reason"];
  return typeof blockReason === "string" ? blockReason : null;
}

/**
 * Order strategy IDs using the sorted chart series order when available.
 *
 * @param strategies - Strategy map from the tooltip payload
 * @param sortedStrategyIds - Visible chart strategy order
 * @returns Ordered strategy IDs
 */
export function getOrderedStrategyIds(
  strategies: StrategiesRecord | undefined,
  sortedStrategyIds: string[] | undefined
): string[] {
  const strategyKeys = Object.keys(strategies ?? {});
  if (!sortedStrategyIds?.length) {
    return strategyKeys;
  }

  return sortedStrategyIds.filter(id => strategies?.[id]);
}

/**
 * Build allocation blocks for strategy allocation bars.
 *
 * @param orderedIds - Strategy IDs in display order
 * @param strategies - Strategy payload map
 * @param sortedStrategyIds - Visible chart strategy order
 * @returns Allocation blocks for the tooltip
 */
export function buildAllocations(
  orderedIds: string[],
  strategies: StrategiesRecord | undefined,
  sortedStrategyIds: string[] | undefined
): AllocationBlock[] {
  return orderedIds
    .map(strategyId =>
      buildAllocationBlock(strategyId, strategies, sortedStrategyIds)
    )
    .filter((allocation): allocation is AllocationBlock => allocation !== null);
}

/**
 * Build strategy, event, signal, and detail sections for a tooltip.
 *
 * @param payload - Recharts tooltip payload
 * @param eventStrategies - Strategy names keyed by signal event
 * @param sentiment - Sentiment label for the current point
 * @param strategies - Strategy data keyed by strategy ID
 * @param orderedIds - Ordered strategy IDs for detail rendering
 * @returns Tooltip sections without allocations
 */
export function buildTooltipSections(
  payload: BacktestTooltipPayloadEntry[],
  eventStrategies: EventStrategiesRecord | undefined,
  sentiment: string | undefined,
  strategies: StrategiesRecord | undefined,
  orderedIds: string[]
): TooltipSections {
  const strategyItems: TooltipItem[] = [];
  const eventItems: EventItem[] = [];
  const signalItems: SignalItem[] = [];
  const detailItems: DetailItem[] = [];

  for (const entry of payload) {
    if (!entry) {
      continue;
    }

    const name = entry.name ?? "";
    const color = entry.color ?? "#fff";

    if (isKnownSignal(name)) {
      signalItems.push({
        name,
        value: formatSignalValue(name, entry.value, sentiment),
        color,
      });
      continue;
    }

    const eventKey = SIGNAL_TO_EVENT_KEY[name];
    if (eventKey) {
      eventItems.push({
        name,
        strategies: eventStrategies?.[eventKey] ?? [],
        color,
      });
      continue;
    }

    if (typeof entry.value === "number") {
      strategyItems.push({ name, value: entry.value, color });
    }
  }

  for (const strategyId of orderedIds) {
    const strategy = strategies?.[strategyId];
    if (strategy?.signal == null) {
      continue;
    }

    const displayName = getStrategyDisplayName(strategyId);
    detailItems.push({
      name: `${displayName} decision`,
      value: `${strategy.decision.action} · ${strategy.decision.reason}`,
      color: "#cbd5e1",
    });

    const targetSpotAsset = resolveBacktestSpotAsset(strategy);
    if (targetSpotAsset) {
      detailItems.push({
        name: `${displayName} spot asset`,
        value: targetSpotAsset,
        color: getBacktestSpotAssetColor(targetSpotAsset),
      });
    }

    if (strategy.execution.blocked_reason) {
      detailItems.push({
        name: `${displayName} blocked`,
        value: strategy.execution.blocked_reason,
        color: "#fda4af",
      });
    }

    const buyGateBlockReason = getBuyGateBlockReason(strategy);
    if (!buyGateBlockReason) {
      continue;
    }

    detailItems.push({
      name: `${displayName} buy gate`,
      value: buyGateBlockReason,
      color: "#fcd34d",
    });
  }

  return {
    strategies: strategyItems,
    events: eventItems,
    signals: signalItems,
    details: detailItems,
  };
}

// =============================================================================
// SIGNAL FORMATTING (merged from backtestTooltipSignalFormatting.ts)
// =============================================================================

const KNOWN_SIGNALS = ["BTC Price", "Sentiment", "VIX", "DMA 200"];

function formatSentimentValue(
  value: number | undefined,
  sentiment: string | undefined
): string {
  const label = sentiment
    ? sentiment.charAt(0).toUpperCase() + sentiment.slice(1)
    : "Unknown";

  return `${label} (${value})`;
}

/**
 * Check whether a tooltip series name should be rendered as a signal row.
 *
 * @param name - Tooltip series name
 * @returns Whether the series is a known signal
 */
function isKnownSignal(name: string): boolean {
  return KNOWN_SIGNALS.includes(name);
}

/**
 * Format a signal value for tooltip display.
 *
 * @param signalName - Signal display name
 * @param value - Raw numeric value
 * @param sentiment - Sentiment label for the current point
 * @returns Formatted display value
 */
function formatSignalValue(
  signalName: string,
  value: number | undefined,
  sentiment: string | undefined
): string | number {
  if (signalName === "Sentiment") {
    return formatSentimentValue(value, sentiment);
  }

  if (signalName === "BTC Price" || signalName === "DMA 200") {
    if (typeof value === "number") {
      return formatCurrency(value, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    }

    return "";
  }

  if (typeof value === "number") {
    return Number(value.toFixed(2));
  }

  return value ?? "";
}

function parseNumericSignal(value: string | number): number | null {
  if (typeof value === "number") {
    return value;
  }

  const cleaned = value.replace(/[$,]/g, "");
  const numericValue = Number(cleaned);

  return Number.isFinite(numericValue) ? numericValue : null;
}

/**
 * Append a synthetic BTC/DMA ratio signal when both inputs are available.
 *
 * @param sections - Mutable tooltip sections
 * @returns Updated signals array
 */
export function appendBtcToDmaRatio(sections: TooltipSections): SignalItem[] {
  const btcSignal = sections.signals.find(
    signal => signal.name === "BTC Price"
  );
  const dmaSignal = sections.signals.find(signal => signal.name === "DMA 200");
  if (!btcSignal || !dmaSignal) {
    return sections.signals;
  }

  const btcValue = parseNumericSignal(btcSignal.value);
  const dmaValue = parseNumericSignal(dmaSignal.value);
  if (btcValue == null || dmaValue == null || dmaValue <= 0) {
    return sections.signals;
  }

  return [
    ...sections.signals,
    {
      name: "BTC / DMA 200",
      value: (btcValue / dmaValue).toFixed(2),
      color: "#a78bfa",
    },
  ];
}
