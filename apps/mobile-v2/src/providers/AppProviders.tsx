import { queryClient } from '@zapengine/app-core/lib/state/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { PrivyProvider } from '@privy-io/expo';
import { PrivyElements } from '@privy-io/expo/ui';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type ReactElement, type ReactNode, useEffect } from 'react';
import { Text, View } from 'react-native';

import { getExpoMobileRuntimeConfig } from '@/config/expoRuntimeConfig';
import { MOBILE_PRIVY_CHAINS } from '@/integration/walletBackendModel';
import { APP_FONTS } from '@/lib/fonts';
import { ToastProvider } from '@/providers/ToastProvider';
import { WalletProvider } from '@/providers/WalletProvider';

void SplashScreen.preventAutoHideAsync();

interface AppProvidersProps {
  children: ReactNode;
}

function AppFrame({ children }: AppProvidersProps): ReactElement {
  const runtimeConfig = getExpoMobileRuntimeConfig();

  return (
    <View className="flex-1 bg-bg" nativeID={runtimeConfig.runtime}>
      <StatusBar style="light" />
      {children}
    </View>
  );
}

function ConfigNoticeScreen(): ReactElement {
  return (
    <AppFrame>
      <View className="flex-1 justify-center px-6">
        <View className="rounded-[24px] border border-line bg-card p-5">
          <Text className="font-sans-semibold text-[18px] text-ink">
            Privy config required
          </Text>
          <Text className="mt-3 text-[13px] leading-5 text-ink-dim">
            Set EXPO_PUBLIC_PRIVY_APP_ID and EXPO_PUBLIC_PRIVY_CLIENT_ID in your
            local .env, then rebuild the Expo dev client. The native wallet
            backend is disabled until both values are present.
          </Text>
        </View>
      </View>
    </AppFrame>
  );
}

export function AppProviders({
  children,
}: AppProvidersProps): ReactElement | null {
  const [fontsLoaded] = useFonts(APP_FONTS);
  const runtimeConfig = getExpoMobileRuntimeConfig();

  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  if (!runtimeConfig.privy) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ConfigNoticeScreen />
        </ToastProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <PrivyProvider
        appId={runtimeConfig.privy.appId}
        clientId={runtimeConfig.privy.clientId}
        supportedChains={[...MOBILE_PRIVY_CHAINS]}
        config={{
          embedded: {
            ethereum: {
              createOnLogin: 'users-without-wallets',
            },
          },
        }}
      >
        <WalletProvider>
          <ToastProvider>
            <AppFrame>{children}</AppFrame>
          </ToastProvider>
        </WalletProvider>
        <PrivyElements
          config={{
            appearance: {
              accentColor: '#d4c5a3',
              colorScheme: 'dark',
            },
          }}
        />
      </PrivyProvider>
    </QueryClientProvider>
  );
}
