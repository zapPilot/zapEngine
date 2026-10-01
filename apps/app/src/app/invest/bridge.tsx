import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import type { ReactElement } from 'react';

import { BridgeDiagnosticScreen } from '@/screens/invest/BridgeDiagnosticScreen';

export default function InvestBridgeRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="invest/bridge">
      <BridgeDiagnosticScreen />
    </ScreenCrashBoundary>
  );
}
