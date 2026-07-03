import { tokens } from '@zapengine/design-tokens/tokens';
import { Stack } from 'expo-router';
import type { ReactElement } from 'react';

import { AppProviders } from '@/providers/AppProviders';

export default function RootLayout(): ReactElement | null {
  return (
    <AppProviders>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: tokens.color.bg },
        }}
      />
    </AppProviders>
  );
}
