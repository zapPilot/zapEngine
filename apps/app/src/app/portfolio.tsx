import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { FinancialFeatureRoute } from '@/components/FinancialFeatureRoute';
import { PortfolioScreen } from '@/screens/PortfolioScreen';

export default function PortfolioRoute(): ReactElement {
  return (
    <FinancialFeatureRoute title="Portfolio">
      <AuthenticatedRoute allowBundleView>
        <PortfolioScreen />
      </AuthenticatedRoute>
    </FinancialFeatureRoute>
  );
}
