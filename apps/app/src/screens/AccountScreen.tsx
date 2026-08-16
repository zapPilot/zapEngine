import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { NonCustodialCard } from '@/components/ui/NonCustodialCard';
import { Tap } from '@/components/ui/Tap';
import { LanguageSettingsCard } from '@/components/account/LanguageSettingsCard';
import { TelegramCard } from '@/components/account/TelegramCard';
import { DEMO } from '@/data/demo';
import { useAccount } from '@/integration/useAccount';
import { truncateAddress } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function AccountScreen() {
  const router = useRouter();
  const account = useAccount();
  const { t } = useContentLanguage();
  const address = account.address ?? DEMO.account.address;

  return (
    <ScreenScrollView>
      <ScreenHeader title={t('tabs.account')} />
      <View className="px-5 pt-5">
        <Tap
          accessibilityRole="button"
          accessibilityLabel={t('account.manageWallets')}
          onPress={() => router.push('/wallets')}
        >
          <Card className="p-5">
            <View className="flex-row items-start justify-between gap-3">
              <View className="min-w-0 flex-1">
                <Text className="font-sans-semibold text-[15px] text-ink">
                  {account.email || DEMO.account.label}
                </Text>
                <Text className="mt-2 font-mono text-[13px] text-accent">
                  {truncateAddress(address)}
                </Text>
              </View>
              <ChevronRight size={18} strokeWidth={1.8} color="#71717a" />
            </View>
          </Card>
        </Tap>
        <LanguageSettingsCard />
        <TelegramCard />
        <View className="mt-4">
          <NonCustodialCard
            title={t('account.approveEveryTransaction')}
            body={t('account.nonCustodialBody')}
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
            ? t('account.disconnectWallet')
            : t('account.connectWallet')}
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
