import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { ActivityScreen } from '@/screens/ActivityScreen';

export default function ActivityRoute(): ReactElement {
  return (
    <AuthenticatedRoute>
      <ActivityScreen />
    </AuthenticatedRoute>
  );
}
