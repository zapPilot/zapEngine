import type { ReactElement } from 'react';

// iOS exposes these routes as informational-only through FinancialFeatureRoute;
// the shared stub exists purely so Metro drops signing/execution imports from
// the iOS bundle for every `.ios.tsx` financial screen that re-exports it.
export function PodcastOnlyStubScreen(): ReactElement | null {
  return null;
}
