import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import type { ReactElement } from 'react';

import { InvestRouteScreen } from '@/screens/invest/InvestRouteScreen';

export default function InvestRouteRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="invest/route">
      <InvestRouteScreen />
    </ScreenCrashBoundary>
  );
}
