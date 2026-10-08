import { tokens } from '@zapengine/design-tokens/tokens';
import { Stack, ThemeProvider, DarkTheme } from 'expo-router';
import { AppShell } from '@/components/shell/AppShell';
import type { ReactElement } from 'react';

import { AnalyticsIdentitySync } from '@/integration/analyticsIdentity';
import { BundleUrlSync } from '@/integration/bundleShareUrlSync';
import {
  DesktopSchedulerContextSync,
  useDesktopBridge,
} from '@/integration/desktopBridge';
import { SessionHintSync } from '@/providers/SessionHintSync';
import { AppProviders } from '@/providers/AppProviders';

export default function RootLayout(): ReactElement | null {
  // Electron shell integration (no-op on native and plain web).
  useDesktopBridge();

  return (
    <AppProviders>
      <DesktopSchedulerContextSync />
      <BundleUrlSync />
      <AnalyticsIdentitySync />
      <SessionHintSync />
      <ThemeProvider
        value={{
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            primary: tokens.mode.night['ink'],
            background: tokens.mode.night['ground'],
            card: tokens.mode.night['sheet'],
            text: tokens.mode.night.ink,
            border: tokens.mode.night['rule'],
            notification: tokens.mode.night['alert'],
          },
        }}
      >
        <AppShell>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: tokens.mode.night['ground'] },
            }}
          />
        </AppShell>
      </ThemeProvider>
    </AppProviders>
  );
}
