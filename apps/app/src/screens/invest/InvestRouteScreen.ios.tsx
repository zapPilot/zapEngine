import type { ReactElement } from 'react';

// iOS ships podcast-only and FinancialFeatureRoute never renders this screen;
// the stub exists purely so Metro drops the wallet/DeFi imports from the iOS bundle.
export function InvestRouteScreen(): ReactElement | null {
  return null;
}
