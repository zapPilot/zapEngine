import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { StrategyScreen } from '@/screens/StrategyScreen';

export default function StrategyRoute(): ReactElement {
  return (
    <AuthenticatedRoute>
      <StrategyScreen />
    </AuthenticatedRoute>
  );
}
