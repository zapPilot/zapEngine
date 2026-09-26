import type { ReactElement } from 'react';

import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import { AiWalletScreen } from '@/screens/AiWalletScreen';

export default function AiWalletRoute(): ReactElement {
  return (
    <ScreenCrashBoundary screen="ai-wallet">
      <AiWalletScreen />
    </ScreenCrashBoundary>
  );
}
