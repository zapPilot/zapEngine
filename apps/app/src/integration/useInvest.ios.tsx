import type { ReactElement, ReactNode } from 'react';

// iOS ships podcast-only; FinancialFeatureRoute short-circuits src/app/invest
// before this provider ever mounts. The stub exists only so _layout.tsx's
// static import doesn't pull the invest business logic (and its wallet/DeFi
// dependencies) into the iOS bundle.
export function InvestProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <>{children}</>;
}
