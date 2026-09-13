import { Stack } from 'expo-router';
import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { FinancialFeatureRoute } from '@/components/FinancialFeatureRoute';
import { InvestProvider } from '@/integration/useInvest';
import { InvestExecutionProvider } from '@/integration/useInvestExecution';
import { UnifiedInvestProvider } from '@/integration/useUnifiedInvest';

export default function InvestLayout(): ReactElement {
  return (
    <FinancialFeatureRoute title="Invest">
      <AuthenticatedRoute>
        <InvestProvider>
          <UnifiedInvestProvider>
            <InvestExecutionProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </InvestExecutionProvider>
          </UnifiedInvestProvider>
        </InvestProvider>
      </AuthenticatedRoute>
    </FinancialFeatureRoute>
  );
}