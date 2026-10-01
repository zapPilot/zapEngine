import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { PortfolioScreen } from '@/screens/PortfolioScreen';

export default function PortfolioRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="portfolio">
      <AuthenticatedRoute allowBundleView>
        <PortfolioScreen />
      </AuthenticatedRoute>
    </ScreenCrashBoundary>
  );
}
