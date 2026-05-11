import type { BacktestTimelinePoint } from '@/types/backtesting';

/**
 * Maximum number of data points to render in the backtesting chart.
 */
export const CHART_POINT_LIMIT = 120;

function sampleEvenlyFromIndices(
  indices: number[],
  targetSize: number,
): number[] {
  if (indices.length <= targetSize) {
    return indices;
  }

  if (targetSize <= 1) {
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

function isCriticalPoint(point: BacktestTimelinePoint): boolean {
  return Object.values(point.strategies).some(
    (strategy) => strategy?.decision?.action !== 'hold',
  );
}

function collectCriticalIndices(
  timeline: BacktestTimelinePoint[],
): Set<number> {
  const criticalIndices = new Set<number>([0, timeline.length - 1]);

  for (const [index, point] of timeline.entries()) {
    if (isCriticalPoint(point)) {
      criticalIndices.add(index);
    }
  }

  return criticalIndices;
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
 * Sample timeline data so every decision day always renders.
 *
 * Invariants:
 * - Every point where any strategy's `decision.action !== 'hold'` is preserved.
 * - First and last points are always preserved.
 * - Non-critical (hold-only) days are evenly sampled to fill the budget
 *   remaining after the critical set.
 *
 * `cap` is a soft target for non-critical sampling, not a hard upper bound on
 * output length. When critical days alone exceed `cap`, output exceeds `cap`
 * because action days must never be dropped.
 *
 * @param timeline - Full timeline array from API
 * @param cap - Soft target for total rendered points (default: CHART_POINT_LIMIT)
 * @returns Sampled timeline array with every action day preserved
 */
export function sampleTimelineData(
  timeline: BacktestTimelinePoint[] | undefined,
  cap: number = CHART_POINT_LIMIT,
): BacktestTimelinePoint[] {
  if (!timeline || timeline.length === 0) {
    return [];
  }

  if (timeline.length <= cap) {
    return timeline;
  }

  const criticalIndices = collectCriticalIndices(timeline);
  const sortedCriticalIndices = Array.from(criticalIndices).sort(
    (a, b) => a - b,
  );

  const remainingSlots = Math.max(0, cap - sortedCriticalIndices.length);

  if (remainingSlots === 0) {
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
