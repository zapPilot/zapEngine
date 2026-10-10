import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@zapengine/app-core/lib/state/queryClient';
import { runBacktest } from '@zapengine/app-core/services/backtestingService';
import { getStrategyConfigs } from '@zapengine/app-core/services/strategyService';
import {
  backtestStats,
  buildDefaultBacktestRequest,
  defaultPortfolioRules,
  referenceSuggestionFromBacktest,
} from './referenceStrategyModel';
/** Today, Decision and Runtime observe the same hour-long reference snapshot. */
export function useReferenceStrategy() {
  return useQuery({
    queryKey: queryKeys.desktop.defaultBacktest('default'),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    queryFn: async () => {
      const configs = await getStrategyConfigs();
      const response = await runBacktest(buildDefaultBacktestRequest(configs));
      return {
        configs,
        response,
        rules: defaultPortfolioRules(configs),
        suggestion: referenceSuggestionFromBacktest(response),
        stats: backtestStats(response),
      };
    },
  });
}
