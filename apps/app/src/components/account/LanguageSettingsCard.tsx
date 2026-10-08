import { Text, View } from 'react-native';

import { ContentLanguageOptionRows } from '@/components/content/ContentLanguageSelector';
import { Card } from '@/components/ui/Card';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

/** Shared by AccountScreen and AccountScreen.ios — same content-language picker on every platform. */
export function LanguageSettingsCard() {
  const { t } = useContentLanguage();

  return (
    <Card className="mt-4 p-5">
      <Text className="font-text-semibold text-body text-ink">
        {t('language.title')}
      </Text>
      <Text className="font-text mt-1 text-caption leading-5 text-ink-2">
        {t('language.description')}
      </Text>
      <View className="mt-3">
        <ContentLanguageOptionRows />
      </View>
    </Card>
  );
}
