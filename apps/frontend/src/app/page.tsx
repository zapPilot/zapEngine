import { Suspense } from 'react';

import { BundlePageEntry } from './bundle/BundlePageEntry';

export function LandingPage() {
  return (
    <Suspense
      fallback={
        <div
          data-testid="bundle-suspense-fallback"
          aria-label="Loading bundle"
        />
      }
    >
      <BundlePageEntry />
    </Suspense>
  );
}
