import { queryClient } from '@zapengine/app-core/lib/state/queryClient';
import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import { type ReactElement, type ReactNode, useEffect, useRef } from 'react';
import {
  AppState,
  type AppStateStatus,
  Platform,
  Text,
  View,
} from 'react-native';
import * as Sentry from '@sentry/react-native';

import { ConnectSheetHost } from '@/components/connect/ConnectSheetHost';
import { PodcastProgressTracker } from '@/components/podcast/PodcastProgressTracker';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ZapLogo } from '@/components/ui/ZapLogo';
import { getExpoMobileRuntimeConfig } from '@/config/expoRuntimeConfig';
import type { MobileRuntimeConfig } from '@/config/mobileRuntimeConfig';
import { APP_FONTS } from '@/lib/fonts';
import { AuthenticatedActionProvider } from '@/providers/AuthenticatedActionProvider';
import { ContentLanguageProvider } from '@/providers/ContentLanguageProvider';
import { PodcastPlayerProvider } from '@/providers/PodcastPlayerProvider';
import { VideoPlaybackCoordinatorProvider } from '@/providers/VideoPlaybackCoordinatorProvider';
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

function useReactQueryNativeAppFocus(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const updateFocus = (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    };
    updateFocus(AppState.currentState);

    const subscription = AppState.addEventListener('change', updateFocus);
    return () => {
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, []);
}

function IconNoticeScreen({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <View className="flex-1 items-center justify-center bg-bg px-6">
      <View className="mb-5 h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface">
        <ZapLogo size={24} />
      </View>
      <Text className="text-center font-sans-semibold text-[20px] text-ink">
        {title}
      </Text>
      <Text className="mt-3 text-center font-sans text-[13px] leading-5 text-ink-dim">
        {body}
      </Text>
      {children}
    </View>
  );
}

function ConfigNoticeScreen({ target }: { target: string }): ReactElement {
  return (
    <IconNoticeScreen
      title="Privy config is missing"
      body={`Add PRIVY_MOBILE_APP_ID and PRIVY_MOBILE_CLIENT_ID before starting the ${target}.`}
    />
  );
}

function CrashFallbackScreen({
  resetError,
}: {
  resetError: () => void;
}): ReactElement {
  return (
    <IconNoticeScreen
      title="Something went wrong"
      body="The app hit an unexpected error. Try again, or restart the app if it keeps happening."
    >
      <PrimaryButton className="mt-6" onPress={resetError}>
        Try again
      </PrimaryButton>
    </IconNoticeScreen>
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
  useReactQueryNativeAppFocus();

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
      <Sentry.ErrorBoundary
        fallback={({ resetError }) => (
          <CrashFallbackScreen resetError={resetError} />
        )}
      >
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <View className="flex-1 bg-bg" nativeID={runtimeConfig.runtime}>
              <StatusBar style="light" />
              <ConfigNoticeScreen target={missingConfigTarget} />
            </View>
          </ToastProvider>
        </QueryClientProvider>
      </Sentry.ErrorBoundary>
    );
  }

  const appContent = (
    <ContentLanguageProvider>
      <PodcastProgressProvider>
        <AuthenticatedActionProvider>
          <VideoPlaybackCoordinatorProvider>
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
          </VideoPlaybackCoordinatorProvider>
        </AuthenticatedActionProvider>
      </PodcastProgressProvider>
    </ContentLanguageProvider>
  );

  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <CrashFallbackScreen resetError={resetError} />
      )}
    >
      <QueryClientProvider client={queryClient}>
        {renderWalletProviders(appContent, runtimeConfig.privy)}
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
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
