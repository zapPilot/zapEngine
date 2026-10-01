import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import type { ReactElement } from 'react';

import { InvestProgressScreen } from '@/screens/invest/InvestProgressScreen';

export default function InvestProgressRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="invest/progress">
      <InvestProgressScreen />
    </ScreenCrashBoundary>
  );
}
