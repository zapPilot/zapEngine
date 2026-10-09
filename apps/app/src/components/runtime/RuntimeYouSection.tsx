import { View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { LanguageSettingsCard } from '@/components/account/LanguageSettingsCard';
import { AppVersionCard } from '@/components/account/AppVersionCard';
import { useAccount } from '@/integration/useAccount';
import { requestAccountConnection } from '@/integration/requestAccountConnection';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { RuntimeDeleteAccount } from './RuntimeDeleteAccount';
export function RuntimeYouSection() {
  const account = useAccount();
  const { t } = useContentLanguage();
  return (
    <View className="gap-3">
      <Text variant="heading">{t('runtime.you')}</Text>
      {account.address ? <Text variant="data">{account.address}</Text> : null}
      <LanguageSettingsCard />
      <AppVersionCard />
      <Button
        variant="secondary"
        onPress={() =>
          account.isConnected
            ? void account.disconnect()
            : requestAccountConnection(account)
        }
      >
        {t(
          account.isConnected
            ? 'account.disconnectWallet'
            : 'account.connectWallet',
        )}
      </Button>
      <RuntimeDeleteAccount />
    </View>
  );
}
