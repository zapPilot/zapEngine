import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { SendScreen } from '@/screens/SendScreen';

export default function SendRoute(): ReactElement {
  return (
    <AuthenticatedRoute>
      <SendScreen />
    </AuthenticatedRoute>
  );
}
