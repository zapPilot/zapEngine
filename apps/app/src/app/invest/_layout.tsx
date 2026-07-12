import { Stack } from 'expo-router';
import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { InvestProvider } from '@/integration/useInvest';
import { InvestExecutionProvider } from '@/integration/useInvestExecution';

export default function InvestLayout(): ReactElement {
  return (
    <AuthenticatedRoute>
      <InvestProvider>
        <InvestExecutionProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </InvestExecutionProvider>
      </InvestProvider>
    </AuthenticatedRoute>
  );
}
