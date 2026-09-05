import {
  classifyIncomeProtocol,
  estimateMonthlyIncomeUsd,
} from '@zapengine/app-core/lib/analytics';
import type { YieldReturnsSummaryResponse } from '@zapengine/app-core/services';

export const MIN_OBSERVED_DAYS = 7;
export const MIN_DISPLAY_MONTHLY_USD = 0.005;

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
  if (!window || observedDays === 0 || window.protocol_breakdown.length === 0) {
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

  return {
    ...emptyResult,
    status: observedDays < MIN_OBSERVED_DAYS ? 'insufficient' : 'ready',
    passiveMonthlyUsd,
    incomeMonthlyUsd,
    costMonthlyUsd,
    protocolRows,
  };
}
