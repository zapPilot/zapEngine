import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import type { ReactElement } from 'react';

import { InvestAmountScreen } from '@/screens/invest/InvestAmountScreen';

export default function InvestAmountRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="invest/amount">
      <InvestAmountScreen />
    </ScreenCrashBoundary>
  );
}
