/**
 * React Query hook for fetching daily strategy suggestions.
 */

import { useQuery } from '@tanstack/react-query';

import { getDailySuggestion } from '@/services';
import type { DailySuggestionResponse } from '@/types/strategy';

/**
 * Query key factory for strategy suggestions
 */
export const suggestionKeys = {
  all: ['suggestion'] as const,
  detail: (userId: string, configId?: string) =>
    [...suggestionKeys.all, userId, configId] as const,
};

/**
 * Hook for fetching daily strategy suggestion.
 *
 * @param userId - User identifier
 * @param configId - Optional preset config_id
 * @param enabled - Whether the query should run (default: true when userId exists)
 * @returns React Query result with suggestion data
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useDailySuggestion(userId);
 *
 * if (isLoading) return <LoadingSpinner />;
 * if (error) return <ErrorMessage error={error} />;
 *
 * return <SuggestionCard suggestion={data} />;
 * ```
 */
export function useDailySuggestion(
  userId: string | undefined,
  configId?: string,
  enabled?: boolean,
) {
  return useQuery<DailySuggestionResponse, Error>({
    queryKey: suggestionKeys.detail(userId ?? '', configId),
    queryFn: () => {
      if (!userId) {
        throw new Error('User ID is required');
      }
      return getDailySuggestion(userId, configId);
    },
    enabled: enabled ?? !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
    retry: 2,
  });
}
