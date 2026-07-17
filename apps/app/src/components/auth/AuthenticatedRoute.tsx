import { type Href, useRouter } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
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
        <Card className="p-5">
          <Text className="font-serif text-[27px] leading-[32px] text-ink">
            Sign in to continue
          </Text>
          <Text className="mt-3 text-[13px] leading-5 text-ink-dim">
            {isWeb
              ? 'Connect with Privy or an approved EIP-7702 wallet to use your portfolio and investment tools.'
              : NATIVE_PRIVY_AUTH_COPY.body}
          </Text>
          <PrimaryButton
            className="mt-5"
            disabled={account.isConnecting}
            accessibilityRole="button"
            accessibilityLabel={isWeb ? 'Sign in' : NATIVE_PRIVY_AUTH_COPY.cta}
            accessibilityHint={isWeb ? undefined : NATIVE_PRIVY_AUTH_COPY.hint}
            accessibilityState={{
              disabled: account.isConnecting,
              busy: account.isConnecting,
            }}
            onPress={() => {
              void account
                .connect()
                .then(() => {
                  if (redirectAfterLogin) {
                    router.replace(redirectAfterLogin);
                  }
                })
                .catch(() => undefined);
            }}
          >
            {account.isConnecting
              ? 'Connecting…'
              : isWeb
                ? 'Sign in'
                : NATIVE_PRIVY_AUTH_COPY.cta}
          </PrimaryButton>
          {!account.isConnecting && account.error ? (
            <View
              accessibilityRole="alert"
              className="mt-4 rounded-2xl border border-[rgba(255,107,107,.42)] bg-[rgba(255,107,107,.08)] px-4 py-3"
            >
              <Text className="font-sans-semibold text-[12.5px] text-[#ff6b6b]">
                {isWeb ? 'Sign-in unavailable' : 'Privy sign-in unavailable'}
              </Text>
              <Text className="mt-1 font-sans text-[11.5px] leading-4 text-ink-dim">
                Please try again. If the problem continues, contact Zap Pilot
                support.
              </Text>
            </View>
          ) : null}
        </Card>
      </View>
    </ScreenScrollView>
  );
}
