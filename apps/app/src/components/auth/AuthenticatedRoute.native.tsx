import { usePrivy } from '@privy-io/expo';
import { useLogin } from '@privy-io/expo/ui';
import { type Href, useRouter } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';

import { ConnectGateCard } from '@/components/connect/ConnectGateCard';
import { CONNECT_GATE_COPY } from '@/components/connect/connectCopy';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import {
  isPrivyLoginCancellation,
  loginWithPrivy,
  NATIVE_PRIVY_AUTH_COPY,
} from '@/integration/nativePrivyLogin';

export function AuthenticatedRoute({
  children,
  redirectAfterLogin,
}: {
  children: ReactNode;
  redirectAfterLogin?: Href;
  allowBundleView?: boolean;
}): ReactElement {
  const { isReady, user } = usePrivy();
  const { login } = useLogin();
  const router = useRouter();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) {
    return <>{children}</>;
  }

  return (
    <ScreenScrollView>
      <View className="flex-1 px-5 pt-16">
        <ConnectGateCard
          variant="page"
          title={CONNECT_GATE_COPY.signInTitle}
          body={NATIVE_PRIVY_AUTH_COPY.body}
          isConnecting={!isReady || isConnecting}
          error={error}
          onConnect={() => {
            if (!isReady || isConnecting) return;
            setError(null);
            setIsConnecting(true);
            void loginWithPrivy(login)
              .then(() => {
                if (redirectAfterLogin) {
                  router.replace(redirectAfterLogin);
                }
              })
              .catch((loginError: unknown) => {
                if (!isPrivyLoginCancellation(loginError)) {
                  setError(
                    loginError instanceof Error
                      ? loginError.message
                      : String(loginError),
                  );
                }
              })
              .finally(() => setIsConnecting(false));
          }}
        />
      </View>
    </ScreenScrollView>
  );
}
