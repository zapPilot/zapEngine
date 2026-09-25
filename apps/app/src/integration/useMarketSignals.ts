import { useMarketDashboardQuery } from '@zapengine/app-core/hooks/queries/market/useMarketDashboardQuery';
import { useMemo } from 'react';

import {
  MARKET_SIGNALS_DAYS,
  marketSignalsFromDashboard,
} from '@/integration/marketSignalsModel';

export function useMarketSignals() {
  const dashboard = useMarketDashboardQuery(MARKET_SIGNALS_DAYS);
  const data = useMemo(
    () => marketSignalsFromDashboard(dashboard.data),
    [dashboard.data],
  );
  return {
    data,
    isLoading: dashboard.isLoading,
    isError: dashboard.isError,
  };
}
