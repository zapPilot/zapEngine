import {
  classifyIncomeProtocol,
  estimateMonthlyIncomeUsd,
} from '@zapengine/app-core/lib/analytics';
import type { YieldReturnsSummaryResponse } from '@zapengine/app-core/services';

export const MIN_OBSERVED_DAYS = 7;

export interface HomeStrategyIncomeRow {
  protocol: string;
  monthlyUsd: number;
}

export interface HomeIncomeView {
  status: 'ready' | 'insufficient' | 'empty';
  passiveMonthlyUsd: number;
  medianDailyUsd: number;
  strategyRows: HomeStrategyIncomeRow[];
  windowDays: number;
  observedDays: number;
}

function strategyLabel(protocol: string): string {
  const normalized = protocol.toLowerCase();
  if (normalized.includes('gmx')) return 'GMX V2';
  if (normalized.includes('hyperliquid')) return 'Hyperliquid HLP';
  return protocol;
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
    strategyRows: [],
    windowDays,
    observedDays,
  };
  if (!window || observedDays === 0 || window.protocol_breakdown.length === 0) {
    return emptyResult;
  }

  let passiveAverageDailyUsd = 0;
  const strategyMonthlyByProtocol = new Map<string, number>();
  for (const item of window.protocol_breakdown) {
    if (classifyIncomeProtocol(item.protocol) === 'passive') {
      passiveAverageDailyUsd += item.window.average_daily_yield_usd;
      continue;
    }
    const label = strategyLabel(item.protocol);
    strategyMonthlyByProtocol.set(
      label,
      (strategyMonthlyByProtocol.get(label) ?? 0) +
        estimateMonthlyIncomeUsd(item.window.average_daily_yield_usd),
    );
  }

  return {
    ...emptyResult,
    status: observedDays < MIN_OBSERVED_DAYS ? 'insufficient' : 'ready',
    passiveMonthlyUsd: estimateMonthlyIncomeUsd(passiveAverageDailyUsd),
    strategyRows: [...strategyMonthlyByProtocol.entries()]
      .map(([protocol, monthlyUsd]) => ({ protocol, monthlyUsd }))
      .sort(
        (left, right) => Math.abs(right.monthlyUsd) - Math.abs(left.monthlyUsd),
      ),
  };
}
