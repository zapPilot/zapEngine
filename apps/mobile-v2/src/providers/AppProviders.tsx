import { WalletProviderBase } from '@zapengine/app-core/providers/walletContext';
import { queryClient } from '@zapengine/app-core/lib/state/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type ReactElement, type ReactNode, useEffect, useMemo } from 'react';
import { View } from 'react-native';

import { getExpoMobileRuntimeConfig } from '@/config/expoRuntimeConfig';
import { APP_FONTS } from '@/lib/fonts';
import { ToastProvider } from '@/providers/ToastProvider';
import { createDisconnectedWalletBackend } from '@/providers/walletBackendStub';

void SplashScreen.preventAutoHideAsync();

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({
  children,
}: AppProvidersProps): ReactElement | null {
  const [fontsLoaded] = useFonts(APP_FONTS);
  const runtimeConfig = getExpoMobileRuntimeConfig();
  const walletBackend = useMemo(() => createDisconnectedWalletBackend(), []);

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProviderBase value={walletBackend}>
        <ToastProvider>
          <View className="flex-1 bg-bg" nativeID={runtimeConfig.runtime}>
            <StatusBar style="light" />
            {children}
          </View>
        </ToastProvider>
      </WalletProviderBase>
    </QueryClientProvider>
  );
}
