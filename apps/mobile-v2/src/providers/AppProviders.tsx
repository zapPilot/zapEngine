import type { PrivyProviderProps } from '@privy-io/expo';
import { PrivyElements } from '@privy-io/expo/ui';
import { queryClient } from '@zapengine/app-core/lib/state/queryClient';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type ReactElement, type ReactNode, useEffect } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ZapLogo } from '@/components/ui/ZapLogo';
import { getExpoMobileRuntimeConfig } from '@/config/expoRuntimeConfig';
import { NATIVE_WALLET_SUPPORTED_CHAINS } from '@/integration/walletBackendModel';
import { APP_FONTS } from '@/lib/fonts';
import { ToastProvider } from '@/providers/ToastProvider';
import {
  MobilePrivyProvider,
  WalletProvider,
} from '@/providers/WalletProvider';

void SplashScreen.preventAutoHideAsync();

const PRIVY_SUPPORTED_CHAINS = NATIVE_WALLET_SUPPORTED_CHAINS as NonNullable<
  PrivyProviderProps['supportedChains']
>;

interface AppProvidersProps {
  children: ReactNode;
}

function ConfigNoticeScreen(): ReactElement {
  return (
    <View className="flex-1 items-center justify-center bg-bg px-6">
      <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface">
        <ZapLogo size={24} />
      </View>
      <Text className="text-center font-sans-semibold text-[20px] text-ink">
        Privy config is missing
      </Text>
      <Text className="mt-3 text-center font-sans text-[13px] leading-5 text-ink-dim">
        Add EXPO_PUBLIC_PRIVY_APP_ID and EXPO_PUBLIC_PRIVY_CLIENT_ID before
        starting the native wallet flow.
      </Text>
    </View>
  );
}

function ConnectGate({ children }: { children: ReactNode }): ReactElement {
  const wallet = useWalletProvider();

  if (wallet.isConnected) {
    return <>{children}</>;
  }

  return (
    <View className="flex-1 items-center justify-center bg-bg px-6">
      <View className="mb-6 h-16 w-16 items-center justify-center rounded-[22px] border border-line bg-surface">
        <ZapLogo size={28} />
      </View>
      <Text className="text-center font-sans-semibold text-[24px] text-ink">
        Connect your portfolio wallet
      </Text>
      <Text className="mt-3 text-center font-sans text-[13px] leading-5 text-ink-dim">
        Sign in with email to create or restore your Privy embedded wallet. Zap
        Pilot stays non-custodial; every transaction still needs your approval.
      </Text>
      {wallet.error ? (
        <Text className="mt-4 text-center font-sans text-[12px] leading-4 text-[#ff6b6b]">
          {wallet.error.message}
        </Text>
      ) : null}
      <PrimaryButton
        className="mt-7"
        disabled={wallet.isConnecting}
        onPress={() => {
          void wallet.connect();
        }}
      >
        {wallet.isConnecting ? 'Preparing wallet…' : 'Connect with email'}
      </PrimaryButton>
    </View>
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
          <View className="flex-1 bg-bg" nativeID={runtimeConfig.runtime}>
            <StatusBar style="light" />
            <ConfigNoticeScreen />
          </View>
        </ToastProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <MobilePrivyProvider
        appId={runtimeConfig.privy.appId}
        clientId={runtimeConfig.privy.clientId}
        supportedChains={PRIVY_SUPPORTED_CHAINS}
      >
        <PrivyElements
          config={{
            appearance: {
              colorScheme: 'dark',
              accentColor: '#d4c5a3',
            },
          }}
        />
        <WalletProvider>
          <ToastProvider>
            <View className="flex-1 bg-bg" nativeID={runtimeConfig.runtime}>
              <StatusBar style="light" />
              <ConnectGate>{children}</ConnectGate>
            </View>
          </ToastProvider>
        </WalletProvider>
      </MobilePrivyProvider>
    </QueryClientProvider>
  );
}
