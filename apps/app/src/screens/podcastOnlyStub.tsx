import type { ReactElement } from 'react';

// iOS ships podcast-only and FinancialFeatureRoute never renders these
// screens; the shared stub exists purely so Metro drops the wallet/DeFi
// (including Hyperliquid) imports from the iOS bundle for every `.ios.tsx`
// screen file that re-exports it below.
export function PodcastOnlyStubScreen(): ReactElement | null {
  return null;
}
