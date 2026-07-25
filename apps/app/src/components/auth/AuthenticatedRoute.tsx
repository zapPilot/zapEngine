import { type Href, useRouter } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { Platform, View } from 'react-native';

import { ConnectGateCard } from '@/components/connect/ConnectGateCard';
import { CONNECT_GATE_COPY } from '@/components/connect/connectCopy';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { useAccount } from '@/integration/useAccount';
import { NATIVE_PRIVY_AUTH_COPY } from '@/integration/nativePrivyLogin';

export function AuthenticatedRoute({
  children,
  redirectAfterLogin,
  allowBundleView,
}: {
  children: ReactNode;
  redirectAfterLogin?: Href;
  /** Let a public `?userId=` bundle view through without a login. */
  allowBundleView?: boolean;
}): ReactElement {
  const account = useAccount();
  const router = useRouter();
  const isWeb = Platform.OS === 'web';

  if (
    account.isConnected ||
    (allowBundleView && account.viewingUserId !== null)
  ) {
    return <>{children}</>;
  }

  return (
    <ScreenScrollView>
      <View className="flex-1 px-5 pt-16">
        <ConnectGateCard
          variant="page"
          title={CONNECT_GATE_COPY.signInTitle}
          body={isWeb ? CONNECT_GATE_COPY.webBody : NATIVE_PRIVY_AUTH_COPY.body}
          isConnecting={account.isConnecting}
          error={account.error}
          onConnect={() => {
            void account
              .connect()
              .then(() => {
                if (redirectAfterLogin) {
                  router.replace(redirectAfterLogin);
                }
              })
              .catch(() => undefined);
          }}
        />
      </View>
    </ScreenScrollView>
  );
}
