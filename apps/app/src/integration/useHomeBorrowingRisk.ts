import { createQueryConfig } from '@zapengine/app-core/hooks/queries/queryDefaults';
import { isNotFoundError } from '@zapengine/app-core/lib/errors';
import { queryKeys } from '@zapengine/app-core/lib/state/queryClient';
import { getBorrowingPositions } from '@zapengine/app-core/services';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { buildHomeBorrowingRiskView } from '@/integration/homeBorrowingRiskModel';

export function useHomeBorrowingRisk(
  subjectUserId: string | null | undefined,
) {
  const userId = subjectUserId?.trim() || undefined;
  const query = useQuery({
    ...createQueryConfig(),
    queryKey: userId ? queryKeys.portfolio.borrowingPositions(userId) : [],
    queryFn: async () => {
      if (!userId) {
        throw new Error('userId is required to fetch borrowing positions');
      }
      return getBorrowingPositions(userId);
    },
    enabled: Boolean(userId),
  });

  const risk = useMemo(
    () => buildHomeBorrowingRiskView(query.data),
    [query.data],
  );
  const noBorrowingPositions = isNotFoundError(query.error);

  return {
    risk,
    isLoading: query.isLoading,
    // The borrowing endpoint uses 404 for a portfolio with no debt. That is an
    // empty state for Home, not a broken Protocol income card.
    isError: query.isError && !noBorrowingPositions,
  };
}
