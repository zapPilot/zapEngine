import { Stack } from 'expo-router';
import type { ReactElement } from 'react';

import { InvestProvider } from '@/integration/useInvest';
import { InvestExecutionProvider } from '@/integration/useInvestExecution';

export default function InvestLayout(): ReactElement {
  return (
    <InvestProvider>
      <InvestExecutionProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </InvestExecutionProvider>
    </InvestProvider>
  );
}
