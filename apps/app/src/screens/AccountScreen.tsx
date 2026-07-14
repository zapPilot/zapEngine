import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { InfoRow } from '@/components/ui/InfoRow';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { ContentLanguageOptionRows } from '@/components/content/ContentLanguageSelector';
import { DEMO } from '@/data/demo';
import { useAccount } from '@/integration/useAccount';
import { NATIVE_PRIVY_AUTH_COPY } from '@/integration/nativePrivyLogin';
import { truncateAddress } from '@/lib/format';

export function AccountScreen() {
  const account = useAccount();
  const address = account.address ?? DEMO.account.address;
  const walletCount = account.walletAddresses.length || 1;

  return (
    <ScreenScrollView>
      <ScreenHeader title="Account" />
      <View className="px-5 pt-5">
        <Card className="p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            {account.email || DEMO.account.label}
          </Text>
          <Text className="mt-2 font-mono text-[13px] text-accent">
            {truncateAddress(address)}
          </Text>
          <View className="mt-4">
            <InfoRow
              label="Mode"
              value={account.isConnected ? 'Live' : 'Demo'}
              divider
            />
            <InfoRow label="Wallets" value={String(walletCount)} divider />
            <InfoRow label="Runtime" value="Expo" />
          </View>
        </Card>
        <Card className="mt-4 p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            Content language
          </Text>
          <Text className="mt-1 text-[12.5px] leading-5 text-ink-dim">
            Affects podcast episodes and audio versions. Listening history is
            preserved.
          </Text>
          <View className="mt-3">
            <ContentLanguageOptionRows />
          </View>
        </Card>
        <View className="mt-4">
          <NonCustodialCard
            title="You approve every transaction"
            body="Zap Pilot can prepare routes, but the wallet backend must sign before anything moves."
          />
        </View>
        <PrimaryButton
          className="mt-5"
          variant={account.isConnected ? 'secondary' : 'primary'}
          onPress={() => {
            if (account.isConnected) {
              void account.disconnect();
            } else {
              void account.connect().catch(() => undefined);
            }
          }}
        >
          {account.isConnected
            ? 'Disconnect wallet'
            : NATIVE_PRIVY_AUTH_COPY.cta}
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
