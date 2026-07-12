import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { AccountScreen } from '@/screens/AccountScreen';

export default function AccountRoute(): ReactElement {
  return (
    <AuthenticatedRoute>
      <AccountScreen />
    </AuthenticatedRoute>
  );
}
