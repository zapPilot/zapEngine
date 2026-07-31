/**
 * Turn a snapshot's positions into the stacked bar the tooltip draws.
 *
 * Reading weights off the snapshot rather than a parallel data file is what
 * keeps the demo and live paths on one code path — a published snapshot already
 * carries `positions[].weight`, so nothing has to be added to the signed
 * schema for the live chart to show the same bar.
 *
 * Stable is the residual, never a symbol list: whatever is not BTC, ETH or SPY
 * is cash by definition, and enumerating stablecoin tickers would silently drop
 * the bar the day the strategy holds one nobody listed.
 */
import type { DailySnapshot } from '@zapengine/types/strategy';
import type { AllocationWeights } from '@/data/track-record-allocations';
import { weightsByAsset } from '@/data/track-record-events';
import type { ChartAllocationBar } from './ChartHoverLayer.client';
import { MARKER_COLOR } from './chartMarkers';

/**
 * Bar order, left to right: risk assets in marker order, then cash. `id` is
 * checked against AllocationWeights by the lookup in allocationBar.
 */
const SEGMENTS = [
  { id: 'btc', label: 'BTC', color: MARKER_COLOR.BTC },
  { id: 'eth', label: 'ETH', color: MARKER_COLOR.ETH },
  { id: 'spy', label: 'SPY', color: MARKER_COLOR.SPY },
  { id: 'stable', label: 'Cash', color: 'var(--event-stable)' },
] as const;

/**
 * Weights this far from a whole book mean the snapshot is not describing one,
 * and a bar drawn from it would look authoritative while being wrong.
 */
const MIN_TOTAL_WEIGHT = 50;
const MIN_VISIBLE_PERCENT = 0.5;

export function allocationFromSnapshot(
  snapshot: DailySnapshot,
): AllocationWeights | null {
  const byAsset = weightsByAsset(snapshot);
  let total = 0;
  for (const weight of byAsset.values()) total += weight;
  if (total < MIN_TOTAL_WEIGHT) return null;

  const risk = {
    btc: byAsset.get('BTC') ?? 0,
    eth: byAsset.get('ETH') ?? 0,
    spy: byAsset.get('SPY') ?? 0,
  };
  const stable = Math.max(0, total - risk.btc - risk.eth - risk.spy);
  // Normalising by the book's own total is what makes the four sum to 100 even
  // when a snapshot's weights are a fraction of a point off.
  const scale = 100 / total;
  return {
    btc: risk.btc * scale,
    eth: risk.eth * scale,
    spy: risk.spy * scale,
    stable: stable * scale,
  };
}

/**
 * Whole display percentages that sum to exactly 100, by largest remainder.
 *
 * Geometry keeps the source weights. Display values are normalised across the
 * visible segments first, so filtering a sub-0.5% sliver cannot make the text
 * add up to 99 (or leave a single 99% segment beside an almost-full bar).
 */
function wholePercents(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);

  const normalised = values.map((value) => (value / total) * 100);
  const floors = normalised.map((value) => Math.floor(value));
  let deficit = 100 - floors.reduce((sum, value) => sum + value, 0);

  const byRemainder = normalised
    .map((value, index) => ({ index, remainder: value - floors[index]! }))
    // Index breaks ties, so the same weights always round the same way.
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  const result = [...floors];
  for (let index = 0; deficit > 0; index += 1) {
    const candidate = byRemainder[index % byRemainder.length];
    if (candidate === undefined) break;
    result[candidate.index]! += 1;
    deficit -= 1;
  }
  return result;
}

export function allocationBar(
  weights: AllocationWeights,
  options: { label?: string; showValues?: boolean } = {},
): ChartAllocationBar {
  const visible = SEGMENTS.flatMap((segment) => {
    const percent = weights[segment.id];
    if (!Number.isFinite(percent) || percent < MIN_VISIBLE_PERCENT) return [];
    return [{ ...segment, percent }];
  });
  const displayPercents = wholePercents(
    visible.map((segment) => segment.percent),
  );

  return {
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.showValues === undefined
      ? {}
      : { showValues: options.showValues }),
    segments: visible.map((segment, index) => ({
      ...segment,
      // Width remains faithful to the portfolio. Only the printed integers are
      // adjusted to sum to 100, avoiding visible geometry jumps around trades.
      display: `${displayPercents[index]!}%`,
    })),
  };
}
