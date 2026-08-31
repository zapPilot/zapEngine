import { usePrivy } from '@privy-io/expo';
import { Text, View } from 'react-native';

import { LanguageSettingsCard } from '@/components/account/LanguageSettingsCard';
import { OpenZapPilotWebButton } from '@/components/OpenZapPilotWebButton';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function AccountScreen() {
  const { logout } = usePrivy();
  const { t } = useContentLanguage();

  return (
    <ScreenScrollView>
      <ScreenHeader title={t('account.settingsTitle')} />
      <View className="px-5 pt-5">
        <Card className="p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            {t('tabs.account')}
          </Text>
          <Text className="mt-2 text-[12.5px] leading-5 text-ink-dim">
            {t('account.iosAuthBody')}
          </Text>
        </Card>

        <LanguageSettingsCard />

        <Card className="mt-4 p-5">
          <Text className="font-sans-semibold text-[15px] text-ink">
            {t('account.webFeaturesTitle')}
          </Text>
          <Text className="mt-1 text-[12.5px] leading-5 text-ink-dim">
            {t('account.webFeaturesBody')}
          </Text>
          <OpenZapPilotWebButton className="mt-4" />
        </Card>

        <PrimaryButton
          className="mt-5"
          variant="secondary"
          onPress={() => void logout()}
        >
          {t('account.signOut')}
        </PrimaryButton>
      </View>
    </ScreenScrollView>
  );
}
