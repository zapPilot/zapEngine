import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { DEFAULT_APP_TAB_PATH } from '@/integration/navigationModel';
import { AccountScreen } from '@/screens/AccountScreen';

export default function AccountRoute(): ReactElement {
  return (
    <AuthenticatedRoute redirectAfterLogin={DEFAULT_APP_TAB_PATH}>
      <AccountScreen />
    </AuthenticatedRoute>
  );
}
