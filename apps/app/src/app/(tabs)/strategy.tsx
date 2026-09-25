import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { DEFAULT_APP_TAB_PATH } from '@/integration/navigationModel';
import { StrategyScreen } from '@/screens/StrategyScreen';

export default function StrategyRoute(): ReactElement {
  return (
    <AuthenticatedRoute redirectAfterLogin={DEFAULT_APP_TAB_PATH}>
      <StrategyScreen />
    </AuthenticatedRoute>
  );
}
