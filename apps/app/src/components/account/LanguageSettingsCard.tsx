import { Text, View } from 'react-native';

import { ContentLanguageOptionRows } from '@/components/content/ContentLanguageSelector';
import { Card } from '@/components/ui/Card';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

/** Shared by AccountScreen and AccountScreen.ios — same content-language picker on every platform. */
export function LanguageSettingsCard() {
  const { t } = useContentLanguage();

  return (
    <Card className="mt-4 p-5">
      <Text className="font-sans-semibold text-[15px] text-ink">
        {t('language.title')}
      </Text>
      <Text className="mt-1 text-[12.5px] leading-5 text-ink-dim">
        {t('language.description')}
      </Text>
      <View className="mt-3">
        <ContentLanguageOptionRows />
      </View>
    </Card>
  );
}
