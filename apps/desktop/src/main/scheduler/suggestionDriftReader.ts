import { getRuntimeEnv } from '@zapengine/app-core/lib/env/runtimeEnv';
import { getDailySuggestion } from '@zapengine/app-core/services';

import type { SchedulerContext } from '../../shared/ipc';
import type { DriftReader } from './rebalanceScheduler';

/**
 * v1 drift source: analytics-engine daily suggestion (no bearer token
 * required). `action.status === 'action_required'` means the target vs
 * current allocation drifted enough that the backend suggests trades.
 *
 * The suggested transfer volume is surfaced as a coarse drift indicator; if
 * the payload carries no numbers we still emit a above-threshold sentinel so
 * the user gets notified and can review in-app.
 */
export function createSuggestionDriftReader(options?: {
  log?: (message: string) => void;
}): DriftReader {
  const log = options?.log ?? (() => undefined);

  return async (context: SchedulerContext) => {
    const analyticsUrl = getRuntimeEnv('VITE_ANALYTICS_ENGINE_URL');
    if (!analyticsUrl) {
      log('scheduler: VITE_ANALYTICS_ENGINE_URL is not configured; skipping');
      return undefined;
    }

    const suggestion = await getDailySuggestion(context.userId);
    if (suggestion.action.status !== 'action_required') {
      return undefined;
    }

    const transfers = suggestion.action.transfers ?? [];
    const totalUsd = transfers.reduce(
      (sum, transfer) => sum + Math.abs(transfer.amount_usd ?? 0),
      0,
    );
    const totalValueUsd = suggestion.context?.portfolio?.total_value_usd;
    const driftPercent =
      typeof totalValueUsd === 'number' && totalValueUsd > 0
        ? (totalUsd / totalValueUsd) * 100
        : 100; // sentinel: actionable but unquantified

    return { driftPercent };
  };
}
