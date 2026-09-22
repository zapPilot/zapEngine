import { LockKeyhole } from 'lucide-react-native';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function FinancialFeatureRoute({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}): ReactElement {
  const { t } = useContentLanguage();

  if (Platform.OS !== 'ios') {
    return <>{children}</>;
  }

  return (
    <ScreenScrollView>
      <ScreenHeader title={title} />
      <View className="px-5 pt-8">
        <Card className="items-center p-6">
          <View className="h-12 w-12 items-center justify-center rounded-full border border-line bg-[rgba(212,197,163,.08)]">
            <LockKeyhole size={20} strokeWidth={1.8} color="#d4c5a3" />
          </View>
          <Text className="mt-4 text-center font-sans-semibold text-[17px] text-ink">
            {t('financialFeature.readOnlyTitle')}
          </Text>
          <Text className="mt-2 text-center text-[12.5px] leading-5 text-ink-dim">
            {t('financialFeature.readOnlyBody')}
          </Text>
        </Card>
      </View>
    </ScreenScrollView>
  );
}
