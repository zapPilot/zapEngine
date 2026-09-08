import type { ReactElement } from 'react';
import { View } from 'react-native';

import { ConnectGateCard } from '@/components/connect/ConnectGateCard';
import { CONNECT_GATE_COPY } from '@/components/connect/connectGateCopy';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';

/** Full-page sign-in prompt shared by the web and iOS route guards. */
export function ConnectGatePage({
  body,
  isConnecting,
  error,
  onConnect,
}: {
  body: string;
  isConnecting: boolean;
  error: string | null;
  onConnect: () => void;
}): ReactElement {
  return (
    <ScreenScrollView>
      <View className="flex-1 px-5 pt-16">
        <ConnectGateCard
          variant="page"
          title={CONNECT_GATE_COPY.signInTitle}
          body={body}
          isConnecting={isConnecting}
          error={error}
          onConnect={onConnect}
        />
      </View>
    </ScreenScrollView>
  );
}
