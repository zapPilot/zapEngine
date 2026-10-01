import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { FinancialFeatureRoute } from '@/components/FinancialFeatureRoute';
import { WalletsScreen } from '@/screens/WalletsScreen';

export default function WalletsRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="wallets">
      <FinancialFeatureRoute title="Wallets">
        <AuthenticatedRoute>
          <WalletsScreen />
        </AuthenticatedRoute>
      </FinancialFeatureRoute>
    </ScreenCrashBoundary>
  );
}
