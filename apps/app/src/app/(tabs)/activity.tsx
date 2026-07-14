import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { DEFAULT_APP_TAB_PATH } from '@/integration/navigationModel';
import { ActivityScreen } from '@/screens/ActivityScreen';

export default function ActivityRoute(): ReactElement {
  return (
    <AuthenticatedRoute redirectAfterLogin={DEFAULT_APP_TAB_PATH}>
      <ActivityScreen />
    </AuthenticatedRoute>
  );
}
