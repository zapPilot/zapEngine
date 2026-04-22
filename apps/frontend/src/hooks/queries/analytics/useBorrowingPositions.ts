/**
 * Borrowing Positions Query Hook
 *
 * Fetches detailed borrowing position data with on-demand loading.
 * Only fetches when enabled (e.g., on tooltip expand).
 */
import { useQuery } from '@tanstack/react-query';

import {
  createQueryConfig,
  logQueryError,
} from '@/hooks/queries/queryDefaults';
import { queryKeys } from '@/lib/state/queryClient';
import { getBorrowingPositions } from '@/services';

const BORROWING_POSITIONS_CACHE_MS = 12 * 60 * 60 * 1000; // 12 hours (matches backend)

/**
 * Hook to fetch borrowing positions with on-demand loading
 *
 * @param userId - User UUID
 * @param enabled - Whether to fetch data (default: false for on-demand loading)
 * @returns React Query result with borrowing positions
 *
 * @example
 * ```typescript
 * // On-demand loading when user expands tooltip
 * const [isExpanded, setIsExpanded] = useState(false);
 * const { data, isLoading, error } = useBorrowingPositions(userId, isExpanded);
 * ```
 */
export function useBorrowingPositions(
  userId: string | undefined,
  enabled = false,
) {
  return useQuery({
    ...createQueryConfig(), // Uses 12hr cache (overridden below)
    queryKey: userId ? queryKeys.portfolio.borrowingPositions(userId) : [],
    queryFn: async () => {
      if (!userId) {
        throw new Error('userId is required to fetch borrowing positions');
      }

      try {
        return await getBorrowingPositions(userId);
      } catch (error) {
        logQueryError('Failed to fetch borrowing positions', error);
        throw error;
      }
    },
    enabled: enabled && !!userId,
    staleTime: BORROWING_POSITIONS_CACHE_MS,
    gcTime: BORROWING_POSITIONS_CACHE_MS * 2,
    retry: 1,
  });
}
