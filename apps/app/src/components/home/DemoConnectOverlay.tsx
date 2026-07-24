import { BlurView } from 'expo-blur';
import { StyleSheet, View } from 'react-native';

import { ConnectGateCard } from '@/components/connect/ConnectGateCard';
import { CONNECT_GATE_COPY } from '@/components/connect/connectCopy';

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
    <View className="absolute inset-0 z-10 items-center justify-center px-8">
      <BlurView
        intensity={26}
        tint="dark"
        style={StyleSheet.absoluteFill}
        experimentalBlurMethod="dimezisBlurView"
      />
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
    </View>
  );
}
