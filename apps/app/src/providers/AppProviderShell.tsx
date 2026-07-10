import { queryClient } from '@zapengine/app-core/lib/state/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { type ReactElement, type ReactNode, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';

import { ConnectSheetHost } from '@/components/connect/ConnectSheetHost';
import { PodcastProgressTracker } from '@/components/podcast/PodcastProgressTracker';
import { ZapLogo } from '@/components/ui/ZapLogo';
import { getExpoMobileRuntimeConfig } from '@/config/expoRuntimeConfig';
import type { MobileRuntimeConfig } from '@/config/mobileRuntimeConfig';
import { APP_FONTS } from '@/lib/fonts';
import { ContentLanguageProvider } from '@/providers/ContentLanguageProvider';
import { PodcastPlayerProvider } from '@/providers/PodcastPlayerProvider';
import { PodcastProgressProvider } from '@/providers/PodcastProgressProvider';
import { ToastProvider } from '@/providers/ToastProvider';

type PrivyRuntimeConfig = NonNullable<MobileRuntimeConfig['privy']>;

interface AppProviderShellProps {
  children: ReactNode;
  missingConfigTarget: string;
  onReady?: () => void;
  renderWalletProviders: (
    content: ReactNode,
    privy: PrivyRuntimeConfig,
  ) => ReactElement;
}

type AppProvidersConfig = Omit<AppProviderShellProps, 'children'>;

function ConfigNoticeScreen({ target }: { target: string }): ReactElement {
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
        starting the {target}.
      </Text>
    </View>
  );
}

export function AppProviderShell({
  children,
  missingConfigTarget,
  onReady,
  renderWalletProviders,
}: AppProviderShellProps): ReactElement | null {
  const [fontsLoaded] = useFonts(APP_FONTS);
  const runtimeConfig = getExpoMobileRuntimeConfig();
  const readyNotifiedRef = useRef(false);

  useEffect(() => {
    if (fontsLoaded && !readyNotifiedRef.current) {
      readyNotifiedRef.current = true;
      onReady?.();
    }
  }, [fontsLoaded, onReady]);

  if (!fontsLoaded) {
    return null;
  }

  if (!runtimeConfig.privy) {
    return (
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <View className="flex-1 bg-bg" nativeID={runtimeConfig.runtime}>
            <StatusBar style="light" />
            <ConfigNoticeScreen target={missingConfigTarget} />
          </View>
        </ToastProvider>
      </QueryClientProvider>
    );
  }

  const appContent = (
    <ContentLanguageProvider>
      <PodcastProgressProvider>
        <PodcastPlayerProvider>
          <PodcastProgressTracker />
          <ToastProvider>
            <View className="flex-1 bg-bg" nativeID={runtimeConfig.runtime}>
              <StatusBar style="light" />
              {children}
              <ConnectSheetHost />
            </View>
          </ToastProvider>
        </PodcastPlayerProvider>
      </PodcastProgressProvider>
    </ContentLanguageProvider>
  );

  return (
    <QueryClientProvider client={queryClient}>
      {renderWalletProviders(appContent, runtimeConfig.privy)}
    </QueryClientProvider>
  );
}

export function createAppProviders(config: AppProvidersConfig) {
  return function AppProviders({
    children,
  }: {
    children: ReactNode;
  }): ReactElement | null {
    return <AppProviderShell {...config}>{children}</AppProviderShell>;
  };
}
