import type { ReactElement } from 'react';

import { FinancialFeatureRoute } from '@/components/FinancialFeatureRoute';
import { HomeScreen } from '@/screens/HomeScreen';

export default function HomeRoute(): ReactElement {
  return (
    <FinancialFeatureRoute title="Home">
      <HomeScreen />
    </FinancialFeatureRoute>
  );
}
