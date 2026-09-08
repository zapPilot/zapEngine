import type { ReactElement } from 'react';

import { FinancialFeatureRoute } from '@/components/FinancialFeatureRoute';
import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import { HomeScreen } from '@/screens/HomeScreen';

export default function HomeRoute(): ReactElement {
  return (
    // Inside FinancialFeatureRoute on purpose: on iOS that wrapper returns a
    // lock screen instead of children, so a boundary outside it would guard
    // the placeholder rather than the screen that actually derives data.
    <FinancialFeatureRoute title="Home">
      <ScreenCrashBoundary screen="home">
        <HomeScreen />
      </ScreenCrashBoundary>
    </FinancialFeatureRoute>
  );
}
