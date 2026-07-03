import { PrivyProvider } from '@privy-io/expo';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@zapengine/app-core/lib/state/queryClient';
import { tokens } from '@zapengine/design-tokens/tokens';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type ReactElement, useEffect } from 'react';

import { getExpoMobileRuntimeConfig } from '@/config/expoRuntimeConfig';
import { APP_FONTS } from '@/lib/fonts';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout(): ReactElement | null {
  const [fontsLoaded] = useFonts(APP_FONTS);
  const config = getExpoMobileRuntimeConfig();

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: tokens.color.bg },
      }}
    />
  );

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      {config.privy ? (
        <PrivyProvider
          appId={config.privy.appId}
          clientId={config.privy.clientId}
        >
          {stack}
        </PrivyProvider>
      ) : (
        // Wallet flows require Privy credentials (wired in the login task);
        // without them the UI still runs in demo mode.
        stack
      )}
    </QueryClientProvider>
  );
}
