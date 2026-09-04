import {
  classifyIncomeProtocol,
  estimateMonthlyIncomeUsd,
} from '@zapengine/app-core/lib/analytics';
import type { YieldReturnsSummaryResponse } from '@zapengine/app-core/services';

export const MIN_OBSERVED_DAYS = 7;

export interface HomeProtocolIncomeRow {
  protocol: string;
  chain?: string;
  /**
   * Net monthly estimate. The summary endpoint reports net protocol yield only,
   * so borrow interest cannot be split out, and deposits or withdrawals move
   * this number too. Do not present it as pure yield.
   */
  monthlyNetUsd: number;
}

export interface HomeIncomeView {
  status: 'ready' | 'insufficient' | 'empty';
  passiveMonthlyUsd: number;
  medianDailyUsd: number;
  windowDays: number;
  observedDays: number;
  protocolRows: HomeProtocolIncomeRow[];
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
      }),
    )
    .sort((a, b) => b.monthlyNetUsd - a.monthlyNetUsd);

  const passiveMonthlyUsd = protocolRows.reduce(
    (total, row) => total + row.monthlyNetUsd,
    0,
  );

  return {
    ...emptyResult,
    status: observedDays < MIN_OBSERVED_DAYS ? 'insufficient' : 'ready',
    passiveMonthlyUsd,
    protocolRows,
  };
}
