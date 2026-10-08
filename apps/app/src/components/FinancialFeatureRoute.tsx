import { Icon } from '@/components/ui/Icon';
import { LockKeyhole } from 'lucide-react-native';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
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
    <ScreenScrollView width="narrow">
      <PageHeader title={title} />
      <View className="pt-8">
        <Card className="items-center p-6">
          <View className="h-12 w-12 items-center justify-center rounded-round border border-rule bg-well">
            <Icon icon={LockKeyhole} size="md" tone="sign" />
          </View>
          <Text className="mt-4 text-center font-text-semibold text-body-lg text-ink">
            {t('financialFeature.readOnlyTitle')}
          </Text>
          <Text className="font-text mt-2 text-center text-caption leading-5 text-ink-2">
            {t('financialFeature.readOnlyBody')}
          </Text>
        </Card>
      </View>
    </ScreenScrollView>
  );
}
