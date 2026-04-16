import { useMutation } from "@tanstack/react-query";

import { runBacktest } from "@/services";
import type { BacktestRequest } from "@/types/backtesting";

/**
 * React Query mutation hook for running backtests.
 *
 * Executes the full DCA comparison backtest against the analytics-engine API.
 */
export function useBacktestMutation() {
  return useMutation({
    mutationFn: (request: BacktestRequest) => runBacktest(request),
  });
}
