import {
  classifyIncomeProtocol,
  estimateMonthlyIncomeUsd,
} from '@zapengine/app-core/lib/analytics';
import type { YieldReturnsSummaryResponse } from '@zapengine/app-core/services';

export const MIN_OBSERVED_DAYS = 7;

export interface HomeIncomeView {
  status: 'ready' | 'insufficient' | 'empty';
  passiveMonthlyUsd: number;
  medianDailyUsd: number;
  windowDays: number;
  observedDays: number;
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
  };
  if (!window || observedDays === 0 || window.protocol_breakdown.length === 0) {
    return emptyResult;
  }

  let passiveAverageDailyUsd = 0;
  for (const item of window.protocol_breakdown) {
    if (classifyIncomeProtocol(item.protocol) === 'passive') {
      passiveAverageDailyUsd += item.window.average_daily_yield_usd;
    }
  }

  return {
    ...emptyResult,
    status: observedDays < MIN_OBSERVED_DAYS ? 'insufficient' : 'ready',
    passiveMonthlyUsd: estimateMonthlyIncomeUsd(passiveAverageDailyUsd),
  };
}
