import { useYieldSummary } from '@zapengine/app-core/hooks/queries/analytics/useYieldSummary';
import { useMemo } from 'react';

import { buildHomeIncomeView } from '@/integration/homeIncomeModel';
import { useHomeBorrowingRisk } from '@/integration/useHomeBorrowingRisk';

export function useHomeIncome(subjectUserId: string | null | undefined) {
  const query = useYieldSummary(subjectUserId ?? undefined);
  const { risk: borrowingRisk } = useHomeBorrowingRisk(subjectUserId);
  const income = useMemo(() => buildHomeIncomeView(query.data), [query.data]);

  return {
    income,
    borrowingRisk,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
