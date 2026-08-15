import type { ReactElement } from 'react';

import { FinancialFeatureRoute } from '@/components/FinancialFeatureRoute';
import { ActivityScreen } from '@/screens/ActivityScreen';

export default function ActivityRoute(): ReactElement {
  return (
    <FinancialFeatureRoute title="Activity">
      <ActivityScreen />
    </FinancialFeatureRoute>
  );
}
