import {
  calculateAdjacentSnapshotChange,
  type DailyValuePoint,
} from '@/integration/portfolioMetrics';

/**
 * Where a range's net worth change came from, summed over its snapshot days.
 *
 * `gainsUsd`/`lossesUsd` deliberately count only market and protocol
 * contributors: a deposit is not a gain, and the near-zero snapshots that
 * appear when upstream data is missing produce huge paired residuals that would
 * otherwise show up as both an enormous gain and an enormous loss.
 */
export interface RangeAttributionSummary {
  netChangeUsd: number;
  marketUsd: number;
  protocolUsd: number;
  flowUsd: number;
  otherUsd: number;
  gainsUsd: number;
  lossesUsd: number;
  attributedDays: number;
  totalDays: number;
}

/** Below this share of explained days the breakdown misleads more than it tells. */
export const MIN_ATTRIBUTION_COVERAGE = 0.5;

export function hasUsableAttribution(
  summary: RangeAttributionSummary,
): boolean {
  return (
    summary.totalDays > 0 &&
    summary.attributedDays / summary.totalDays >= MIN_ATTRIBUTION_COVERAGE
  );
}

export function summarizeRangeAttribution(
  trendPoints: readonly DailyValuePoint[],
): RangeAttributionSummary | null {
  const first = trendPoints.at(0)?.total_value_usd;
  const last = trendPoints.at(-1)?.total_value_usd;
  if (
    trendPoints.length < 2 ||
    typeof first !== 'number' ||
    typeof last !== 'number'
  ) {
    return null;
  }

  let marketUsd = 0;
  let protocolUsd = 0;
  let flowUsd = 0;
  let gainsUsd = 0;
  let lossesUsd = 0;
  let attributedDays = 0;
  let totalDays = 0;

  for (let index = 1; index < trendPoints.length; index += 1) {
    if (calculateAdjacentSnapshotChange(trendPoints, index) === null) continue;
    totalDays += 1;

    const attribution = trendPoints[index]?.attribution ?? [];
    if (attribution.length === 0) continue;
    attributedDays += 1;

    for (const contributor of attribution) {
      if (contributor.kind === 'market') marketUsd += contributor.valueUsd;
      else if (contributor.kind === 'protocol')
        protocolUsd += contributor.valueUsd;
      else if (contributor.kind === 'flow') flowUsd += contributor.valueUsd;
      else continue;

      if (contributor.kind === 'flow') continue;
      if (contributor.valueUsd > 0) gainsUsd += contributor.valueUsd;
      else lossesUsd += contributor.valueUsd;
    }
  }

  return {
    netChangeUsd: last - first,
    marketUsd,
    protocolUsd,
    flowUsd,
    // Taken as the remainder so the three named buckets plus this one always
    // add up to the headline exactly. It absorbs per-day residuals, days with
    // no attribution at all, and contributors dropped below the display epsilon.
    otherUsd: last - first - marketUsd - protocolUsd - flowUsd,
    gainsUsd,
    lossesUsd,
    attributedDays,
    totalDays,
  };
}
