import { tokens } from '@zapengine/design-tokens/tokens';
import { Stack } from 'expo-router';
import type { ReactElement } from 'react';

import {
  DesktopSchedulerContextSync,
  useDesktopBridge,
} from '@/integration/desktopBridge';
import { AppProviders } from '@/providers/AppProviders';

export default function RootLayout(): ReactElement | null {
  // Electron shell integration (no-op on native and plain web).
  useDesktopBridge();

  return (
    <AppProviders>
      <DesktopSchedulerContextSync />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: tokens.color.bg },
        }}
      />
    </AppProviders>
  );
}
