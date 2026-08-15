import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConnectGateCard } from '@/components/connect/ConnectGateCard';
import { CONNECT_GATE_COPY } from '@/components/connect/connectGateCopy';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

interface DemoConnectOverlayProps {
  onConnect: () => void;
  isConnecting?: boolean;
  error?: string | null;
}

/** Plain blur cover for secondary demo sections (no repeated CTA). */
export function DemoBlurCover() {
  return (
    <View
      className="absolute inset-0 z-10 overflow-hidden rounded-3xl"
      pointerEvents="none"
    >
      <BlurView
        intensity={26}
        tint="dark"
        style={StyleSheet.absoluteFill}
        experimentalBlurMethod="dimezisBlurView"
      />
    </View>
  );
}

interface BlurredOverlayFrameProps {
  children: ReactNode;
}

/** Shared frame for centered Home overlays that blur the demo content below. */
function BlurredOverlayFrame({ children }: BlurredOverlayFrameProps) {
  return (
    <View className="absolute inset-0 z-10 items-center justify-center px-8">
      <BlurView
        intensity={26}
        tint="dark"
        style={StyleSheet.absoluteFill}
        experimentalBlurMethod="dimezisBlurView"
      />
      {children}
    </View>
  );
}

/**
 * Bank-style demo gate: blurs the sample numbers underneath and floats a
 * sign-in card on top. Mount inside a `relative` container wrapping the
 * demo-data sections.
 */
export function DemoConnectOverlay({
  onConnect,
  isConnecting,
  error,
}: DemoConnectOverlayProps) {
  return (
    <BlurredOverlayFrame>
      <View className="w-full max-w-[360px]">
        <ConnectGateCard
          variant="overlay"
          title={CONNECT_GATE_COPY.demoTitle}
          body={CONNECT_GATE_COPY.demoBody}
          onConnect={onConnect}
          isConnecting={isConnecting}
          error={error}
        />
      </View>
    </BlurredOverlayFrame>
  );
}

interface AccountUnavailableCardProps {
  onRetry: () => void;
  isRetrying?: boolean;
  variant: 'page' | 'overlay';
}

/** Recovery card for a connected wallet whose account record failed to load. */
export function AccountUnavailableCard({
  onRetry,
  isRetrying = false,
  variant,
}: AccountUnavailableCardProps) {
  const { t } = useContentLanguage();

  return (
    <ConnectGateCard
      variant={variant}
      title={t('account.unavailableTitle')}
      body={t('account.unavailableBody')}
      onConnect={onRetry}
      actionLabel={t('common.retry')}
      isConnecting={isRetrying}
    />
  );
}

interface AccountUnavailableOverlayProps {
  onRetry: () => void;
  isRetrying?: boolean;
}

/** Blurred Home gate around the reusable account recovery card. */
export function AccountUnavailableOverlay({
  onRetry,
  isRetrying = false,
}: AccountUnavailableOverlayProps) {
  return (
    <BlurredOverlayFrame>
      <View className="w-full max-w-[360px]">
        <AccountUnavailableCard
          variant="overlay"
          onRetry={onRetry}
          isRetrying={isRetrying}
        />
      </View>
    </BlurredOverlayFrame>
  );
}
