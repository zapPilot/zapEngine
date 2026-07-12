import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { PortfolioScreen } from '@/screens/PortfolioScreen';

export default function PortfolioRoute(): ReactElement {
  return (
    <AuthenticatedRoute>
      <PortfolioScreen />
    </AuthenticatedRoute>
  );
}
