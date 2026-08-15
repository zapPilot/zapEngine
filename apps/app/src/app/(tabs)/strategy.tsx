import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { FinancialFeatureRoute } from '@/components/FinancialFeatureRoute';
import { DEFAULT_APP_TAB_PATH } from '@/integration/navigationModel';
import { StrategyScreen } from '@/screens/StrategyScreen';

export default function StrategyRoute(): ReactElement {
  return (
    <FinancialFeatureRoute title="Strategy">
      <AuthenticatedRoute redirectAfterLogin={DEFAULT_APP_TAB_PATH}>
        <StrategyScreen />
      </AuthenticatedRoute>
    </FinancialFeatureRoute>
  );
}
