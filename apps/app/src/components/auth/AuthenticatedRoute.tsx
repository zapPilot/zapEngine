import { type Href, useRouter, useUnstableGlobalHref } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { useAuthenticatedAction } from '@/providers/AuthenticatedActionProvider';

import { ConnectGatePage } from '@/components/connect/ConnectGatePage';
import { CONNECT_GATE_COPY } from '@/components/connect/connectGateCopy';
import { AccountUnavailableCard } from '@/components/home/DemoConnectOverlay';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { useAccount } from '@/integration/useAccount';
import { NATIVE_PRIVY_AUTH_COPY } from '@/integration/nativePrivyLogin';

export function AuthenticatedRoute({
  children,
  allowBundleView,
}: {
  children: ReactNode;
  /** Let a public `?userId=` bundle view through without a login. */
  allowBundleView?: boolean;
}): ReactElement {
  const account = useAccount();
  const router = useRouter();
  const originalHref = useUnstableGlobalHref();
  const { run } = useAuthenticatedAction();
  const isWeb = Platform.OS === 'web';

  if (allowBundleView && account.viewingUserId !== null) {
    return <>{children}</>;
  }

  if (account.isConnected && !account.isUserResolutionFailed) {
    return <>{children}</>;
  }

  if (account.isConnected) {
    return (
      <ScreenScrollView width="narrow">
        <View className="flex-1 px-5 pt-16">
          <AccountUnavailableCard
            variant="page"
            onRetry={() => void account.retryUserResolution()}
            isRetrying={account.loadingUser}
          />
        </View>
      </ScreenScrollView>
    );
  }

  return (
    <ConnectGatePage
      body={isWeb ? CONNECT_GATE_COPY.webBody : NATIVE_PRIVY_AUTH_COPY.body}
      isConnecting={account.isConnecting}
      error={account.connectionError}
      onConnect={() => run(() => router.replace(originalHref as Href))}
    />
  );
}
