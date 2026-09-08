import { usePrivy } from '@privy-io/expo';
import { useLogin } from '@privy-io/expo/ui';
import { type Href, useRouter } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';

import { ConnectGatePage } from '@/components/connect/ConnectGatePage';
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
    <ConnectGatePage
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
  );
}
