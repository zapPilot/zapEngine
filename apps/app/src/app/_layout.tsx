import { tokens } from '@zapengine/design-tokens/tokens';
import { Stack, ThemeProvider, DarkTheme } from 'expo-router';
import { AppShell } from '@/components/shell/AppShell';
import type { ReactElement } from 'react';

import { AnalyticsIdentitySync } from '@/integration/analyticsIdentity';
import { OwnBundleUrlSync } from '@/integration/bundleShareUrlSync';
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
      <OwnBundleUrlSync />
      <AnalyticsIdentitySync />
      <SessionHintSync />
      <ThemeProvider
        value={{
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            primary: tokens.color.accent,
            background: tokens.color.bg,
            card: tokens.color.surface,
            text: tokens.color.ink,
            border: tokens.color.line,
            notification: tokens.color.danger,
          },
        }}
      >
        <AppShell>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: tokens.color.bg },
            }}
          />
        </AppShell>
      </ThemeProvider>
    </AppProviders>
  );
}
