import type { ReactElement } from 'react';

import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { WalletsScreen } from '@/screens/WalletsScreen';

export default function WalletsRoute(): ReactElement {
  return (
    <AuthenticatedRoute>
      <WalletsScreen />
    </AuthenticatedRoute>
  );
}
