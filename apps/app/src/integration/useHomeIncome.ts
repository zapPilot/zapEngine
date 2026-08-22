import { useYieldSummary } from '@zapengine/app-core/hooks/queries/analytics/useYieldSummary';
import { useMemo } from 'react';

import { buildHomeIncomeView } from '@/integration/homeIncomeModel';

export function useHomeIncome(subjectUserId: string | null | undefined) {
  const query = useYieldSummary(subjectUserId ?? undefined);
  const income = useMemo(() => buildHomeIncomeView(query.data), [query.data]);
  return { income, isLoading: query.isLoading, isError: query.isError };
}
