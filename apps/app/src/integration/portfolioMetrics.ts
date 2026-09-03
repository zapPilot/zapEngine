import type { DailyYieldReturnsResponse } from '@zapengine/app-core/services';
import { isFiniteNumber } from '@zapengine/types/shared';

export type PortfolioAttributionKind = 'market' | 'yield' | 'residual';

export interface PortfolioAttributionContributor {
  kind: PortfolioAttributionKind;
  label: string;
  valueUsd: number;
}

export interface DailyValueCategory {
  assets_usd?: number;
  debt_usd?: number;
  category?: string;
  source_type?: string;
  value_usd?: number;
  pnl_usd?: number;
}

export interface DailyValuePoint {
  date?: string;
  total_value_usd?: number;
  categories?: readonly DailyValueCategory[];
  attribution?: readonly PortfolioAttributionContributor[];
}

export interface SnapshotChange {
  usd: number;
  pct: number | null;
}

export interface SnapshotCategoryTotals {
  assetsUsd?: number;
  debtUsd?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ATTRIBUTION_EPSILON_USD = 0.005;

export function sortedDailyValues(
  dailyValues: readonly DailyValuePoint[] | undefined,
): DailyValuePoint[] {
  return [...(dailyValues ?? [])].sort((a, b) => {
    const aDate = a.date ?? '';
    const bDate = b.date ?? '';
    return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
  });
}

/** Keep every usable snapshot intact so chart consumers retain its metadata. */
export function toTrendPoints(
  dailyValues: readonly DailyValuePoint[] | undefined,
): DailyValuePoint[] {
  return sortedDailyValues(dailyValues).filter((point) =>
    isFiniteNumber(point.total_value_usd),
  );
}

export function calculateAdjacentSnapshotChange(
  trendPoints: readonly DailyValuePoint[] | undefined,
  index = (trendPoints?.length ?? 0) - 1,
): SnapshotChange | null {
  const current = trendPoints?.[index]?.total_value_usd;
  const previous = trendPoints?.[index - 1]?.total_value_usd;
  if (!isFiniteNumber(current) || !isFiniteNumber(previous)) {
    return null;
  }

  return {
    usd: current - previous,
    pct: previous > 0 ? ((current - previous) / previous) * 100 : null,
  };
}

export function calculateWindowValueChangePct(
  dailyValues: readonly DailyValuePoint[] | undefined,
  days: number,
): number | null {
  const sorted = toTrendPoints(dailyValues);
  const latest = sorted.at(-1);
  if (!latest?.date || !isFiniteNumber(latest.total_value_usd)) {
    return null;
  }

  const latestTs = Date.parse(latest.date);
  if (Number.isNaN(latestTs)) {
    return null;
  }
  const targetTs = latestTs - days * MS_PER_DAY;

  const start =
    sorted
      .filter((point) => {
        if (!point.date) return false;
        const ts = Date.parse(point.date);
        return !Number.isNaN(ts) && ts <= targetTs;
      })
      .at(-1) ?? sorted[0];

  if (!start || !isFiniteNumber(start.total_value_usd)) {
    return null;
  }

  const startValue = start.total_value_usd;
  if (startValue <= 0) {
    return null;
  }

  return ((latest.total_value_usd - startValue) / startValue) * 100;
}

function sumFiniteCategoryField(
  categories: readonly DailyValueCategory[] | undefined,
  field: keyof DailyValueCategory,
): number | undefined {
  const values = (categories ?? [])
    .map((category) => category[field])
    .filter(isFiniteNumber);
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0)
    : undefined;
}

/** Gross values are summed across every category/source represented upstream. */
export function snapshotCategoryTotals(
  point: DailyValuePoint,
): SnapshotCategoryTotals {
  const assetsUsd = sumFiniteCategoryField(point.categories, 'assets_usd');
  const debtUsd = sumFiniteCategoryField(point.categories, 'debt_usd');
  return {
    ...(assetsUsd === undefined ? {} : { assetsUsd }),
    ...(debtUsd === undefined ? {} : { debtUsd }),
  };
}

function dateKey(value: string | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function addContributor(
  bucket: Map<string, PortfolioAttributionContributor>,
  contributor: PortfolioAttributionContributor,
) {
  if (
    !Number.isFinite(contributor.valueUsd) ||
    Math.abs(contributor.valueUsd) < ATTRIBUTION_EPSILON_USD
  ) {
    return;
  }
  const key = `${contributor.kind}:${contributor.label}`;
  const existing = bucket.get(key);
  bucket.set(key, {
    ...contributor,
    valueUsd: (existing?.valueUsd ?? 0) + contributor.valueUsd,
  });
}

/**
 * Attach conservative change attribution to chart snapshots.
 *
 * The daily yield endpoint can prove two pieces for tracked DeFi token
 * positions: price effect and amount-change effect. Everything else remains a
 * residual so deposits, withdrawals, wallet holdings, borrowing changes, or
 * unsupported protocols are never silently relabeled as investment P&L.
 */
export function attachDailyAttribution(
  trendPoints: readonly DailyValuePoint[],
  yieldData: DailyYieldReturnsResponse | undefined,
): DailyValuePoint[] {
  const byDate = new Map<string, Map<string, PortfolioAttributionContributor>>();

  for (const entry of yieldData?.daily_returns ?? []) {
    const key = dateKey(entry.date);
    if (!key) continue;
    const bucket = byDate.get(key) ?? new Map();
    byDate.set(key, bucket);

    addContributor(bucket, {
      kind: 'yield',
      label: entry.protocol_name,
      valueUsd: entry.yield_return_usd,
    });

    for (const token of entry.tokens) {
      addContributor(bucket, {
        kind: 'market',
        label: token.symbol,
        valueUsd: token.market_return_usd,
      });
    }
  }

  return trendPoints.map((point, index) => {
    const key = dateKey(point.date);
    const bucket = key ? new Map(byDate.get(key) ?? []) : new Map();
    const change = calculateAdjacentSnapshotChange(trendPoints, index);

    if (change) {
      const explained = [...bucket.values()].reduce(
        (total, item) => total + item.valueUsd,
        0,
      );
      addContributor(bucket, {
        kind: 'residual',
        label: 'Other / flows',
        valueUsd: change.usd - explained,
      });
    }

    const attribution = [...bucket.values()]
      .filter((item) => Math.abs(item.valueUsd) >= ATTRIBUTION_EPSILON_USD)
      .sort((a, b) => Math.abs(b.valueUsd) - Math.abs(a.valueUsd));

    return attribution.length > 0 ? { ...point, attribution } : { ...point };
  });
}

export function nearestTrendPointIndex(
  pointerX: number,
  width: number,
  pointCount: number,
): number | null {
  if (
    !Number.isFinite(pointerX) ||
    !Number.isFinite(width) ||
    width <= 0 ||
    pointCount <= 0
  ) {
    return null;
  }
  if (pointCount === 1) return 0;
  const clampedX = Math.max(0, Math.min(width, pointerX));
  return Math.round((clampedX / width) * (pointCount - 1));
}

export function trendPointX(
  index: number,
  width: number,
  pointCount: number,
): number {
  if (pointCount <= 1 || width <= 0) return 0;
  return Math.max(0, Math.min(width, (index / (pointCount - 1)) * width));
}
