import { useQuery } from '@tanstack/react-query';
import { getDailySuggestion } from '@zapengine/app-core/services';
import type { DailySuggestionResponse } from '@zapengine/app-core/types/strategy';

export interface CompositionTarget {
  equities: number;
  crypto: number;
  stables: number;
}

type AssetAllocation =
  DailySuggestionResponse['context']['target']['allocation'];

function toPercent(ratio: number | undefined): number {
  return Number(((ratio ?? 0) * 100).toFixed(10));
}

function toPillarTarget(allocation: AssetAllocation): CompositionTarget {
  const btc = toPercent(allocation.btc);
  const eth = toPercent(allocation.eth);
  const alt = toPercent(allocation.alt);

  return {
    equities: toPercent(allocation.spy),
    crypto: btc + eth + alt,
    stables: toPercent(allocation.stable),
  };
}

export function toCompositionTargetFromSuggestion(
  suggestion: DailySuggestionResponse,
): CompositionTarget {
  return toPillarTarget(suggestion.context.target.allocation);
}

export function useStrategySuggestion(userId: string | null) {
  return useQuery<DailySuggestionResponse, Error>({
    queryKey: ['desktop', 'strategy-suggestion', userId ?? 'no-user'],
    queryFn: () => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      return getDailySuggestion(userId);
    },
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 2,
  });
}
