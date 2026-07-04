import { Stack } from 'expo-router';
import type { ReactElement } from 'react';

import { InvestProvider } from '@/integration/useInvest';

export default function InvestLayout(): ReactElement {
  return (
    <InvestProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </InvestProvider>
  );
}
