import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { FinancialFeatureRoute } from '@/components/FinancialFeatureRoute';
import { SendScreen } from '@/screens/SendScreen';

export default function SendRoute(): ReactElement {
  return (
    <FinancialFeatureRoute title="Send">
      <AuthenticatedRoute>
        <SendScreen />
      </AuthenticatedRoute>
    </FinancialFeatureRoute>
  );
}
