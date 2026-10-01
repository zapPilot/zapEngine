import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { Callout } from '@/components/ui/Callout';
import { Tap } from '@/components/ui/Tap';
import { LanguageSettingsCard } from '@/components/account/LanguageSettingsCard';
import { DeleteAccountCard } from '@/components/account/DeleteAccountCard';
import { TelegramCard } from '@/components/account/TelegramCard';
import { DEMO } from '@/data/demo';
import { requestAccountConnection } from '@/integration/requestAccountConnection';
import { useAccount } from '@/integration/useAccount';
import { truncateAddress } from '@/lib/format';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function AccountScreen() {
  const router = useRouter();
  const account = useAccount();
  const { t } = useContentLanguage();
  const address = account.address ?? DEMO.account.address;

  return (
    <ScreenScrollView width="narrow">
      <PageHeader title={t('tabs.account')} />
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
          <Callout
            tone="info"
            title={t('account.approveEveryTransaction')}
            body={t('account.nonCustodialBody')}
          />
        </View>
        <Button
          className="mt-5"
          variant={account.isConnected ? 'secondary' : 'primary'}
          onPress={() => {
            if (account.isConnected) {
              void account.disconnect();
            } else {
              requestAccountConnection(account);
            }
          }}
        >
          {account.isConnected
            ? t('account.disconnectWallet')
            : t('account.connectWallet')}
        </Button>
        <DeleteAccountCard />
      </View>
    </ScreenScrollView>
  );
}
