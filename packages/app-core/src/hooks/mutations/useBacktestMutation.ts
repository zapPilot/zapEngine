import { runBacktest } from '@core/services';
import type { BacktestRequest } from '@core/types/backtesting';
import { useMutation } from '@tanstack/react-query';

/**
 * React Query mutation hook for running backtests.
 *
 * Executes a strategy comparison backtest against the analytics-engine API.
 */
export function useBacktestMutation() {
  return useMutation({
    mutationFn: (request: BacktestRequest) => runBacktest(request),
  });
}
