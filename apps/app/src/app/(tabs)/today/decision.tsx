import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import type { ReactElement } from 'react';

import { DecisionScreen } from '@/screens/DecisionScreen';

export default function DecisionRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="decision">
      <DecisionScreen />
    </ScreenCrashBoundary>
  );
}
