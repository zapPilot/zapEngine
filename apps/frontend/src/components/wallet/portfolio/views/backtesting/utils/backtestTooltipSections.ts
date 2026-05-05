import type { BacktestBucket } from '@/types/backtesting';
import { formatCurrency } from '@/utils';

import {
  getBacktestTransferDirection,
  hasBacktestAllocation,
  isBacktestTransfer,
  resolveBacktestDisplayAllocation,
} from '../backtestBuckets';
import { DCA_CLASSIC_STRATEGY_ID } from '../constants';
import type {
  AllocationBlock,
  BacktestTooltipPayloadEntry,
  DecisionAssetChangeItem,
  DecisionSummary,
  EventItem,
  EventStrategiesRecord,
  SignalItem,
  StrategiesRecord,
  TooltipItem,
  TooltipSections,
} from './backtestTooltipDataTypes';
import { CHART_SIGNALS } from './chartHelpers';
import { resolveBacktestSpotAsset } from './spotAssetDisplay';
import { getStrategyDisplayName } from './strategyDisplay';

const SIGNAL_EVENT_KEYS = new Set<string>([
  'buy_spot',
  'sell_spot',
  'switch_to_eth',
  'switch_to_btc',
]);

const SIGNAL_TO_EVENT_KEY: Record<string, string> = Object.fromEntries(
  CHART_SIGNALS.filter((signal) => SIGNAL_EVENT_KEYS.has(signal.key)).map(
    (signal) => [signal.name, signal.key],
  ),
);

const ACTION_COLORS = {
  buy: '#86efac',
  sell: '#fca5a5',
  hold: '#cbd5e1',
} as const;

const ROTATION_COLOR = '#c4b5fd';
const NOTE_COLOR = '#cbd5e1';
const BLOCKED_COLOR = '#fda4af';

function buildAllocationBlock(
  strategyId: string,
  strategies: StrategiesRecord | undefined,
  sortedStrategyIds: string[] | undefined,
): AllocationBlock | null {
  const strategy = strategies?.[strategyId];
  const allocation = strategy
    ? resolveBacktestDisplayAllocation(strategy)
    : null;
  if (!allocation || !hasBacktestAllocation(allocation)) {
    return null;
  }

  return {
    id: strategyId,
    displayName: getStrategyDisplayName(strategyId),
    allocation,
    index: sortedStrategyIds?.indexOf(strategyId),
  };
}

function getBuyGateBlockReason(
  strategy: StrategiesRecord[string],
): string | null {
  const plugin = strategy.execution.diagnostics?.plugins?.['dma_buy_gate'];
  if (!plugin || typeof plugin !== 'object') {
    return null;
  }

  const blockReason = plugin['block_reason'];
  return typeof blockReason === 'string' ? blockReason : null;
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
  sortedStrategyIds: string[] | undefined,
): string[] {
  const strategyKeys = Object.keys(strategies ?? {});
  if (!sortedStrategyIds?.length) {
    return strategyKeys;
  }

  return sortedStrategyIds.filter((id) => strategies?.[id]);
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
  sortedStrategyIds: string[] | undefined,
): AllocationBlock[] {
  return orderedIds
    .map((strategyId) =>
      buildAllocationBlock(strategyId, strategies, sortedStrategyIds),
    )
    .filter((allocation): allocation is AllocationBlock => allocation !== null);
}

function formatActionLabel(
  action: StrategiesRecord[string]['decision']['action'],
) {
  return action.charAt(0).toUpperCase() + action.slice(1);
}

function formatBucketLabel(
  bucket: BacktestBucket,
  strategy: StrategiesRecord[string],
): string {
  if (bucket === 'stable') {
    return 'Stable';
  }

  if (bucket === 'spot') {
    return resolveBacktestSpotAsset(strategy) ?? 'Spot';
  }

  return bucket.toUpperCase();
}

function getAssetChangeColor(
  fromBucket: BacktestBucket,
  toBucket: BacktestBucket,
): string {
  const direction = getBacktestTransferDirection(fromBucket, toBucket);
  if (direction === 'stable_to_spot') {
    return ACTION_COLORS.buy;
  }

  if (direction === 'spot_to_stable') {
    return ACTION_COLORS.sell;
  }

  if (fromBucket !== 'stable' && toBucket !== 'stable') {
    return ROTATION_COLOR;
  }

  return NOTE_COLOR;
}

function buildAssetChanges(
  strategy: StrategiesRecord[string],
): DecisionAssetChangeItem[] {
  const transfers = Array.isArray(strategy.execution.transfers)
    ? strategy.execution.transfers
    : [];

  return transfers.filter(isBacktestTransfer).map((transfer) => ({
    label: `${formatBucketLabel(transfer.from_bucket, strategy)} -> ${formatBucketLabel(
      transfer.to_bucket,
      strategy,
    )}`,
    value: formatCurrency(transfer.amount_usd, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
    color: getAssetChangeColor(transfer.from_bucket, transfer.to_bucket),
  }));
}

function getActiveDecisionStrategyId(
  strategies: StrategiesRecord | undefined,
  orderedIds: string[],
): string | null {
  const activeComparisonId = orderedIds.find(
    (strategyId) =>
      strategyId !== DCA_CLASSIC_STRATEGY_ID && strategies?.[strategyId],
  );
  if (activeComparisonId) {
    return activeComparisonId;
  }

  const signaledEntry = Object.entries(strategies ?? {}).find(
    ([, strategy]) => strategy.signal != null,
  );
  return signaledEntry?.[0] ?? null;
}

function getDecisionRule(strategy: StrategiesRecord[string]) {
  const allocationName = strategy.decision.details?.allocation_name;
  return {
    label:
      typeof allocationName === 'string' && allocationName.trim()
        ? allocationName
        : strategy.decision.reason,
    group: strategy.decision.rule_group,
  };
}

function buildDecisionSummary(
  strategies: StrategiesRecord | undefined,
  orderedIds: string[],
): DecisionSummary | null {
  const strategyId = getActiveDecisionStrategyId(strategies, orderedIds);
  const strategy = strategyId ? strategies?.[strategyId] : undefined;
  if (!strategy || !strategyId) {
    return null;
  }

  const assetChanges = buildAssetChanges(strategy);
  const blockedReason =
    strategy.execution.blocked_reason ?? getBuyGateBlockReason(strategy);

  return {
    strategyId,
    displayName: getStrategyDisplayName(strategyId),
    rule: getDecisionRule(strategy),
    action: {
      label: formatActionLabel(strategy.decision.action),
      color: ACTION_COLORS[strategy.decision.action],
    },
    assetChanges,
    assetChangeNote:
      assetChanges.length > 0
        ? null
        : {
            label: blockedReason
              ? `No asset changes - blocked by ${blockedReason}`
              : 'No asset changes - held position',
            color: blockedReason ? BLOCKED_COLOR : NOTE_COLOR,
          },
  };
}

/**
 * Build strategy, event, signal, and decision sections for a tooltip.
 *
 * @param payload - Recharts tooltip payload
 * @param eventStrategies - Strategy names keyed by signal event
 * @param sentiment - Sentiment label for the current point
 * @param macroFearGreedLabel - Macro FGI label for the current point
 * @param strategies - Strategy data keyed by strategy ID
 * @param orderedIds - Ordered strategy IDs for decision rendering
 * @returns Tooltip sections without allocations
 */
export function buildTooltipSections(
  payload: BacktestTooltipPayloadEntry[],
  eventStrategies: EventStrategiesRecord | undefined,
  sentiment: string | undefined,
  macroFearGreedLabel: string | undefined,
  strategies: StrategiesRecord | undefined,
  orderedIds: string[],
): TooltipSections {
  const strategyItems: TooltipItem[] = [];
  const eventItems: EventItem[] = [];
  const signalItems: SignalItem[] = [];

  for (const entry of payload) {
    if (!entry) {
      continue;
    }

    const name = String(entry.name ?? '');
    const color = entry.color ?? '#fff';

    if (isKnownSignal(name)) {
      signalItems.push({
        name,
        value: formatSignalValue(
          name,
          typeof entry.value === 'number' ? entry.value : undefined,
          sentiment,
          macroFearGreedLabel,
        ),
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

    if (typeof entry.value === 'number') {
      strategyItems.push({ name, value: entry.value, color });
    }
  }

  return {
    strategies: strategyItems,
    events: eventItems,
    signals: signalItems,
    decision: buildDecisionSummary(strategies, orderedIds),
  };
}

// =============================================================================
// SIGNAL FORMATTING (merged from backtestTooltipSignalFormatting.ts)
// =============================================================================

const KNOWN_SIGNALS = ['BTC Price', 'Sentiment', 'Macro FGI', 'VIX', 'DMA 200'];

function formatSentimentValue(
  value: number | undefined,
  sentiment: string | undefined,
): string {
  const label = sentiment
    ? sentiment.charAt(0).toUpperCase() + sentiment.slice(1)
    : 'Unknown';

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
 * @param macroFearGreedLabel - Macro FGI label for the current point
 * @returns Formatted display value
 */
function formatSignalValue(
  signalName: string,
  value: number | undefined,
  sentiment: string | undefined,
  macroFearGreedLabel: string | undefined,
): string | number {
  if (signalName === 'Sentiment') {
    return formatSentimentValue(value, sentiment);
  }

  if (signalName === 'Macro FGI') {
    return formatSentimentValue(value, macroFearGreedLabel);
  }

  if (signalName === 'BTC Price' || signalName === 'DMA 200') {
    if (typeof value === 'number') {
      return formatCurrency(value, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    }

    return '';
  }

  if (typeof value === 'number') {
    return Number(value.toFixed(2));
  }

  return value ?? '';
}

function parseNumericSignal(value: string | number): number | null {
  if (typeof value === 'number') {
    return value;
  }

  const cleaned = value.replace(/[$,]/g, '');
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
    (signal) => signal.name === 'BTC Price',
  );
  const dmaSignal = sections.signals.find(
    (signal) => signal.name === 'DMA 200',
  );
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
      name: 'BTC / DMA 200',
      value: (btcValue / dmaValue).toFixed(2),
      color: '#a78bfa',
    },
  ];
}
