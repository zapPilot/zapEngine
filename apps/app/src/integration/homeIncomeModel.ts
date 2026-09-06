import {
  classifyIncomeProtocol,
  estimateMonthlyIncomeUsd,
} from '@zapengine/app-core/lib/analytics';
import type { YieldReturnsSummaryResponse } from '@zapengine/app-core/services';

export const MIN_OBSERVED_DAYS = 7;
export const MIN_DISPLAY_MONTHLY_USD = 0.005;
const ETH_STAKING_PROTOCOL = 'ETH Staking';

export interface HomeProtocolIncomeRow {
  protocol: string;
  chain?: string;
  /**
   * Net monthly estimate. The summary endpoint reports net protocol yield only,
   * so a negative number is a protocol cost / negative yield, not necessarily
   * pure borrow interest.
   */
  monthlyNetUsd: number;
  tokenSymbols: string[];
  positionTypes: string[];
}

export interface HomeIncomeView {
  status: 'ready' | 'insufficient' | 'empty';
  passiveMonthlyUsd: number;
  incomeMonthlyUsd: number;
  costMonthlyUsd: number;
  medianDailyUsd: number;
  windowDays: number;
  observedDays: number;
  protocolRows: HomeProtocolIncomeRow[];
}

function sortProtocolRows(
  a: HomeProtocolIncomeRow,
  b: HomeProtocolIncomeRow,
): number {
  const aPositive = a.monthlyNetUsd > 0;
  const bPositive = b.monthlyNetUsd > 0;

  if (aPositive !== bPositive) return aPositive ? -1 : 1;
  if (aPositive) return b.monthlyNetUsd - a.monthlyNetUsd;
  return a.monthlyNetUsd - b.monthlyNetUsd;
}

export function buildHomeIncomeView(
  summary: YieldReturnsSummaryResponse | undefined,
  windowKey = '30d',
): HomeIncomeView {
  const window = summary?.windows[windowKey];
  const windowDays = Number.parseInt(windowKey, 10) || 30;
  const observedDays = window?.statistics.total_days ?? 0;
  const hasStakingEstimate =
    window?.protocol_breakdown.some(
      (item) => item.protocol === ETH_STAKING_PROTOCOL,
    ) ?? false;
  const emptyResult: HomeIncomeView = {
    status: 'empty',
    passiveMonthlyUsd: 0,
    incomeMonthlyUsd: 0,
    costMonthlyUsd: 0,
    medianDailyUsd: window?.median_daily_yield_usd ?? 0,
    windowDays,
    observedDays,
    protocolRows: [],
  };
  if (
    !window ||
    window.protocol_breakdown.length === 0 ||
    (observedDays === 0 && !hasStakingEstimate)
  ) {
    return emptyResult;
  }

  const protocolRows = window.protocol_breakdown
    .filter((item) => classifyIncomeProtocol(item.protocol) === 'passive')
    .map(
      (item): HomeProtocolIncomeRow => ({
        protocol: item.protocol,
        ...(item.chain ? { chain: item.chain } : {}),
        monthlyNetUsd: estimateMonthlyIncomeUsd(
          item.window.average_daily_yield_usd,
        ),
        tokenSymbols: item.token_symbols ?? [],
        positionTypes: item.position_types ?? [],
      }),
    )
    .filter((row) => Math.abs(row.monthlyNetUsd) >= MIN_DISPLAY_MONTHLY_USD)
    .sort(sortProtocolRows);

  const incomeMonthlyUsd = protocolRows.reduce(
    (total, row) => (row.monthlyNetUsd > 0 ? total + row.monthlyNetUsd : total),
    0,
  );
  const costMonthlyUsd = protocolRows.reduce(
    (total, row) => (row.monthlyNetUsd < 0 ? total + row.monthlyNetUsd : total),
    0,
  );
  const passiveMonthlyUsd = incomeMonthlyUsd + costMonthlyUsd;
  const stakingOnlyEstimate = observedDays === 0 && hasStakingEstimate;

  return {
    ...emptyResult,
    status:
      stakingOnlyEstimate || observedDays >= MIN_OBSERVED_DAYS
        ? 'ready'
        : 'insufficient',
    passiveMonthlyUsd,
    incomeMonthlyUsd,
    costMonthlyUsd,
    protocolRows,
  };
}

/** Share of each side's magnitude the visible rows must cover before the tail
 *  is rolled up. The long tail is mostly dust that pushes the real drivers off
 *  the first screen. */
export const INCOME_COVERAGE_TARGET = 0.8;

export interface HomeIncomePartition {
  visible: HomeProtocolIncomeRow[];
  other: HomeProtocolIncomeRow[];
  otherIncomeUsd: number;
  otherCostUsd: number;
}

function takeCoverage(
  rows: readonly HomeProtocolIncomeRow[],
  coverage: number,
): { visible: HomeProtocolIncomeRow[]; other: HomeProtocolIncomeRow[] } {
  const target =
    rows.reduce((total, row) => total + Math.abs(row.monthlyNetUsd), 0) *
    coverage;
  const visible: HomeProtocolIncomeRow[] = [];
  const other: HomeProtocolIncomeRow[] = [];
  let running = 0;

  for (const row of rows) {
    if (visible.length > 0 && running >= target) {
      other.push(row);
      continue;
    }
    visible.push(row);
    running += Math.abs(row.monthlyNetUsd);
  }

  return { visible, other };
}

/**
 * Split the already-sorted rows into the few that carry most of each side and
 * the tail behind a single "Other" row. Income and cost are covered separately
 * so a large income side cannot hide every cost.
 */
export function partitionIncomeRowsByCoverage(
  rows: readonly HomeProtocolIncomeRow[],
  coverage = INCOME_COVERAGE_TARGET,
): HomeIncomePartition {
  const income = takeCoverage(
    rows.filter((row) => row.monthlyNetUsd > 0),
    coverage,
  );
  const cost = takeCoverage(
    rows.filter((row) => row.monthlyNetUsd < 0),
    coverage,
  );
  const other = [...income.other, ...cost.other];

  // Hiding a single row behind a tap tells the reader less than the row did.
  if (other.length < 2) {
    return {
      visible: [...rows],
      other: [],
      otherIncomeUsd: 0,
      otherCostUsd: 0,
    };
  }

  return {
    visible: [...income.visible, ...cost.visible],
    other,
    otherIncomeUsd: income.other.reduce(
      (total, row) => total + row.monthlyNetUsd,
      0,
    ),
    otherCostUsd: cost.other.reduce(
      (total, row) => total + row.monthlyNetUsd,
      0,
    ),
  };
}
