import type { ReactElement, ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { useAccount } from '@/integration/useAccount';

export function AuthenticatedRoute({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const account = useAccount();

  if (account.isConnected) {
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
            Connect with Privy or an approved EIP-7702 wallet to use your
            portfolio and investment tools.
          </Text>
          <PrimaryButton
            className="mt-5"
            disabled={account.isConnecting}
            onPress={() => void account.connect()}
          >
            {account.isConnecting ? 'Connecting…' : 'Sign in'}
          </PrimaryButton>
        </Card>
      </View>
    </ScreenScrollView>
  );
}
