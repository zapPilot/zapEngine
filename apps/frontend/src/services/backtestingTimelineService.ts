import {
  DCA_CLASSIC_STRATEGY_ID,
  isBacktestTransfer,
  resolveBacktestSpotAsset,
} from '@/components/wallet/portfolio/views/backtesting';
import type {
  BacktestTimelinePoint,
  BacktestTransferMetadata,
} from '@/types/backtesting';

const EVENT_PADDING = 20;

/**
 * Minimum number of data points to keep in the timeline for chart rendering.
 * Ensures sufficient data density for meaningful chart visualization.
 */
export const MIN_CHART_POINTS = 90;

/**
 * Maximum number of data points to allow in the timeline.
 * Allows dynamic expansion for event-heavy timelines while maintaining performance.
 */
export const MAX_CHART_POINTS = 150;

function extractTransfers(
  strategy: BacktestTimelinePoint['strategies'][string] | undefined,
): BacktestTransferMetadata[] {
  const transfers = strategy?.execution?.transfers;

  if (!Array.isArray(transfers)) {
    return [];
  }

  return transfers.filter(isBacktestTransfer);
}

function sampleEvenlyFromIndices(
  indices: number[],
  targetSize: number,
): number[] {
  if (indices.length <= targetSize) {
    return indices;
  }

  if (targetSize === 0) {
    return [];
  }

  if (targetSize === 1) {
    const middleIndex = indices[Math.floor(indices.length / 2)];
    return middleIndex !== undefined ? [middleIndex] : [];
  }

  const step = (indices.length - 1) / (targetSize - 1);
  const sampled: number[] = [];
  for (let i = 0; i < targetSize; i++) {
    const indexValue = indices[Math.round(i * step)];
    if (indexValue !== undefined) {
      sampled.push(indexValue);
    }
  }

  return sampled;
}

function hasCriticalStrategyEvent(
  strategy: BacktestTimelinePoint['strategies'][string] | undefined,
  previousStrategy: BacktestTimelinePoint['strategies'][string] | undefined,
): boolean {
  return (
    extractTransfers(strategy).length > 0 ||
    resolveBacktestSpotAsset(strategy) !==
      resolveBacktestSpotAsset(previousStrategy)
  );
}

function collectCriticalIndices(
  timeline: BacktestTimelinePoint[],
): Set<number> {
  const criticalIndices = new Set<number>([0, timeline.length - 1]);

  for (const [index, point] of timeline.entries()) {
    const previousPoint = index > 0 ? timeline[index - 1] : undefined;
    const hasCriticalEvent = Object.entries(point.strategies).some(
      ([strategyId, strategy]) =>
        strategyId !== DCA_CLASSIC_STRATEGY_ID &&
        hasCriticalStrategyEvent(
          strategy,
          previousPoint?.strategies[strategyId],
        ),
    );
    if (hasCriticalEvent) {
      criticalIndices.add(index);
    }
  }

  return criticalIndices;
}

function calculateEffectiveMax(
  minPoints: number,
  criticalIndexCount: number,
): number {
  return Math.min(
    MAX_CHART_POINTS,
    Math.max(minPoints, criticalIndexCount + EVENT_PADDING),
  );
}

function mapIndicesToTimeline(
  timeline: BacktestTimelinePoint[],
  indices: number[],
): BacktestTimelinePoint[] {
  return indices
    .map((index) => timeline[index])
    .filter((point): point is BacktestTimelinePoint => point !== undefined);
}

function collectNonCriticalIndices(
  timelineLength: number,
  criticalIndices: Set<number>,
): number[] {
  const nonCriticalIndices: number[] = [];

  for (let i = 0; i < timelineLength; i++) {
    if (!criticalIndices.has(i)) {
      nonCriticalIndices.push(i);
    }
  }

  return nonCriticalIndices;
}

/**
 * Sample timeline data while preserving critical trading events.
 *
 * Always preserves:
 * - First and last points
 * - Points where any non-dca_classic strategy executes spot/stable transfers
 * - Points where any non-dca_classic strategy changes its current `spot_asset`
 *
 * Dynamically expands the point limit to fit all strategy events, then samples
 * non-critical points evenly to fill remaining slots.
 *
 * @param timeline - Full timeline array from API
 * @param minPoints - Minimum number of points to return (default: MIN_CHART_POINTS)
 * @returns Sampled timeline array with trading events preserved
 */
export function sampleTimelineData(
  timeline: BacktestTimelinePoint[] | undefined,
  minPoints: number = MIN_CHART_POINTS,
): BacktestTimelinePoint[] {
  if (!timeline || timeline.length === 0) {
    return [];
  }

  if (timeline.length <= minPoints) {
    return timeline;
  }

  const criticalIndices = collectCriticalIndices(timeline);
  const effectiveMax = calculateEffectiveMax(minPoints, criticalIndices.size);

  if (timeline.length <= effectiveMax) {
    return timeline;
  }

  const sortedCriticalIndices = Array.from(criticalIndices).sort(
    (a, b) => a - b,
  );
  const remainingSlots = effectiveMax - sortedCriticalIndices.length;

  if (remainingSlots <= 0) {
    return mapIndicesToTimeline(timeline, sortedCriticalIndices);
  }

  const nonCriticalIndices = collectNonCriticalIndices(
    timeline.length,
    criticalIndices,
  );
  const sampledNonCriticalIndices = sampleEvenlyFromIndices(
    nonCriticalIndices,
    remainingSlots,
  );

  const finalIndices = [
    ...sortedCriticalIndices,
    ...sampledNonCriticalIndices,
  ].sort((a, b) => a - b);

  return mapIndicesToTimeline(timeline, finalIndices);
}
