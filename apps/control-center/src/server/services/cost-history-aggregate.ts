/**
 * Everything the cost reads do to `ops_cost_snapshots` rows once they are in
 * memory. It lives apart from `cost-repository.ts` so the row math can be
 * exercised without a Supabase client: the repository is then only queries and
 * RPC calls, and every rule about what a null means is stated here once.
 */

import type {
  CostProvider,
  CostSnapshot,
  CostType,
  CostUsageItem,
} from '@zapengine/cost-observability';

import type {
  CostHistoryPoint,
  CostHistoryProviderPoint,
  CostProviderResult,
  MonthlyCostPoint,
  ProviderMonthCost,
} from '../../shared/types.js';

/**
 * One `ops_cost_snapshots` row as PostgREST hands it over. `numeric` columns
 * come back as strings often enough that the widened type is the honest one,
 * and `numericOrNull` is the single place that narrows them.
 */
export interface SnapshotRow {
  provider: CostProvider;
  snapshot_date: string;
  period_start: string;
  period_end: string;
  accrued_cost_usd: number | string | null;
  projected_cost_usd: number | string | null;
  cost_type: CostType;
  source: CostSnapshot['source'];
  usage: CostUsageItem[];
  pricing_rate_id: string | null;
  fetched_at: string;
}

export const PROVIDER_LABELS: Record<CostProvider, string> = {
  debank: 'DeBank',
  openrouter: 'OpenRouter',
  brave: 'Brave Search',
  supabase: 'Supabase',
  fly: 'Fly.io',
};

/**
 * Fly publishes no billing or usage API, so the flyctl collector can only
 * price the fleet it happens to catch running and an operator reading the Fly
 * dashboard is the only source of what Fly actually billed. Naming that
 * command in the message is the difference between a dashboard that shows a
 * gap and one that tells you how to close it.
 */
export const FLY_RUN_RATE_ONLY_MESSAGE =
  'Run-rate only — no billed figure recorded this month. Record the Fly dashboard total with: pnpm ops:cost snapshot fly <usd>';

const METERED_UNPRICED_MESSAGE = 'Usage synced; USD cost unknown';

/**
 * Why a persisted row carries no accrued cost.
 *
 * Both cases are successful collections whose dollar figure is genuinely
 * unknown, not failures, so the caller keeps the row at `ok` and shows this as
 * the reason the provider is absent from the headline totals. Without it the
 * UI has an em dash and nothing to act on.
 */
export function describeSnapshot(row: SnapshotRow): string | null {
  if (row.accrued_cost_usd !== null) {
    return null;
  }
  if (row.provider === 'fly' && row.source === 'api') {
    return FLY_RUN_RATE_ONLY_MESSAGE;
  }
  return row.provider === 'debank' || row.provider === 'brave'
    ? METERED_UNPRICED_MESSAGE
    : null;
}

export function rowToSnapshot(row: SnapshotRow): CostSnapshot {
  return {
    provider: row.provider,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    accruedCostUsd: numericOrNull(row.accrued_cost_usd),
    projectedCostUsd: numericOrNull(row.projected_cost_usd),
    costType: row.cost_type,
    source: row.source,
    usage: row.usage,
    fetchedAt: row.fetched_at,
  };
}

/**
 * One card per known provider, built from the newest row the ledger holds for
 * each.
 *
 * Load-bearing: the first row met for a provider wins, so the caller must
 * query newest-first (`snapshot_date` then `fetched_at`, both descending).
 *
 * A newest row from an earlier month is reported as if nothing had been
 * recorded — `unconfigured`, no snapshot — because every caller sums the
 * snapshots it is handed into *this* month's headline totals. An operator's
 * August Fly reading is August's bill, and a provider whose sync stopped in
 * August has said nothing about September; either one summed into a September
 * total is spend nobody incurred. The message names the reading that does
 * exist, so a gap that will close itself tonight reads differently from a
 * provider that was never wired up, and the row keeps feeding the charts
 * through `aggregateDaily` either way.
 */
export function toProviderResults(
  rows: readonly SnapshotRow[],
  now: Date,
): CostProviderResult[] {
  const newest = new Map<CostProvider, SnapshotRow>();
  for (const row of rows) {
    if (!newest.has(row.provider)) {
      newest.set(row.provider, row);
    }
  }
  const currentMonth = now.toISOString().slice(0, 7);
  return (Object.keys(PROVIDER_LABELS) as CostProvider[]).map((provider) => {
    const row = newest.get(provider);
    if (!row) {
      return noCurrentFigure({
        provider,
        costType: defaultCostType(provider),
        message:
          provider === 'fly' ? 'Needs current estimate' : 'No snapshot yet',
      });
    }
    if (monthOf(row) !== currentMonth) {
      return noCurrentFigure({
        provider,
        costType: row.cost_type,
        message: `Last reading ${row.snapshot_date} is ${monthOf(row)} spend; nothing recorded for ${currentMonth}`,
      });
    }
    return {
      provider,
      label: PROVIDER_LABELS[provider],
      status: 'ok' as const,
      costType: row.cost_type,
      snapshot: rowToSnapshot(row),
      message: describeSnapshot(row),
    };
  });
}

function defaultCostType(provider: CostProvider): CostType {
  if (provider === 'supabase') return 'fixed';
  if (provider === 'debank' || provider === 'brave') {
    return 'list-price-equivalent';
  }
  return 'estimated';
}

/**
 * A provider with nothing to contribute to this month's totals. `status` is
 * what keeps it out of them; the message is what stops the absence from
 * reading as a zero.
 */
function noCurrentFigure(input: {
  provider: CostProvider;
  costType: CostType;
  message: string;
}): CostProviderResult {
  return {
    provider: input.provider,
    label: PROVIDER_LABELS[input.provider],
    status: 'unconfigured',
    costType: input.costType,
    snapshot: null,
    message: input.message,
  };
}

/**
 * The daily chart, one point per snapshot date.
 *
 * Load-bearing: dates come back in the order they first appear in `rows`, so
 * the caller must query ascending by `snapshot_date` for the last point to be
 * the latest day.
 *
 * An unpriced row (`accrued_cost_usd` null — a Fly run-rate reading) stays in
 * the day's `providers` split even though it cannot join the total, because
 * naming who was left out is the whole reason the split exists.
 */
export function aggregateDaily(
  rows: readonly SnapshotRow[],
): CostHistoryPoint[] {
  const byDate = new Map<string, CostHistoryProviderPoint[]>();
  for (const row of rows) {
    const points = byDate.get(row.snapshot_date) ?? [];
    points.push({
      provider: row.provider,
      label: PROVIDER_LABELS[row.provider],
      accruedCostUsd: numericOrNull(row.accrued_cost_usd),
      costType: row.cost_type,
      source: row.source,
      periodEnd: row.period_end,
    });
    byDate.set(row.snapshot_date, points);
  }
  return [...byDate.entries()].map(([date, points]) => {
    const providers = [...points].sort(compareProviderPoints);
    return { date, accruedCostUsd: dayTotal(providers), providers };
  });
}

export function aggregateMonthly(
  rows: readonly SnapshotRow[],
): MonthlyCostPoint[] {
  const latest = latestBy(rows, (row) => `${monthOf(row)}:${row.provider}`);
  const totals = new Map<string, number[]>();
  for (const [key, row] of latest) {
    if (row.accrued_cost_usd === null) {
      continue;
    }
    const month = key.slice(0, 7);
    const values = totals.get(month) ?? [];
    values.push(Number(row.accrued_cost_usd));
    totals.set(month, values);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, values]) => ({ month, accruedCostUsd: sumNumbers(values) }));
}

/**
 * R2's "which provider is driving the change" needs a same-shape number for
 * the prior month, not the monthly total `aggregateMonthly` already collapses
 * providers out of — so this keeps the per-provider split for exactly one
 * month instead of discarding it.
 *
 * Every provider appears, which is what keeps "no row that month" (null)
 * distinguishable from "spent nothing that month" (0): the projection treats
 * the first as no prior at all and the second as a real one.
 */
export function aggregateByProviderForMonth(
  rows: readonly SnapshotRow[],
  month: string,
): ProviderMonthCost[] {
  const inMonth = rows.filter((row) => monthOf(row) === month);
  const latestPerProvider = latestBy(inMonth, (row) => row.provider);
  return (Object.keys(PROVIDER_LABELS) as CostProvider[]).map((provider) => {
    const row = latestPerProvider.get(provider);
    return {
      provider,
      accruedCostUsd:
        row === undefined ? null : numericOrNull(row.accrued_cost_usd),
    };
  });
}

export function sumNumbers(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

/**
 * Collapse rows to the latest one per key. Both monthly rollups want exactly
 * this and differ only in what they key on, so neither keeps its own copy of
 * the comparison.
 */
function latestBy<Key>(
  rows: readonly SnapshotRow[],
  keyOf: (row: SnapshotRow) => Key,
): Map<Key, SnapshotRow> {
  const latest = new Map<Key, SnapshotRow>();
  for (const row of rows) {
    const key = keyOf(row);
    const previous = latest.get(key);
    if (!previous || previous.snapshot_date <= row.snapshot_date) {
      latest.set(key, row);
    }
  }
  return latest;
}

/**
 * A day's accrued total. Only known values are summed and a day with no known
 * value at all stays null: a provider without a figure is not worth 0, and
 * folding it in is how an unpriced row becomes a confident number.
 */
function dayTotal(points: CostHistoryProviderPoint[]): number | null {
  const priced: number[] = [];
  for (const point of points) {
    if (point.accruedCostUsd !== null) {
      priced.push(point.accruedCostUsd);
    }
  }
  return sumNumbers(priced);
}

/**
 * Biggest spender first, unpriced providers last, ties by provider name. The
 * tooltip reads top-down, so its order has to come from the data rather than
 * from whichever row the query happened to return first.
 */
function compareProviderPoints(
  a: CostHistoryProviderPoint,
  b: CostHistoryProviderPoint,
): number {
  const left = a.accruedCostUsd;
  const right = b.accruedCostUsd;
  if (left !== null && right !== null && left !== right) {
    return right - left;
  }
  if ((left === null) !== (right === null)) {
    return left === null ? 1 : -1;
  }
  return a.provider.localeCompare(b.provider);
}

function monthOf(row: SnapshotRow): string {
  return row.snapshot_date.slice(0, 7);
}

function numericOrNull(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}
