import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import type { ReactElement } from 'react';

import { Redirect } from 'expo-router';

export default function InvestConfirmRoute(): ReactElement {
  // Keep old deep links safe while the route and confirm steps are merged.
  return (
    <ScreenCrashBoundary screen="invest/confirm">
      <Redirect href="/invest/route" />
    </ScreenCrashBoundary>
  );
}
