import { Headphones } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export default function NotFoundRoute() {
  const router = useRouter();
  const { t } = useContentLanguage();
  return (
    <ScreenCrashBoundary screen="not-found">
      <ScreenScrollView width="narrow">
        <PageHeader mode="root" title={t('common.pageNotFound')} />
        <View className="mt-8">
          <EmptyState
            icon={Headphones}
            title={t('common.pageNotFound')}
            body={t('common.pageNotFoundBody')}
            action={{
              label: t('tabs.podcast'),
              accessibilityLabel: t('tabs.podcast'),
              onPress: () => router.replace('/podcast'),
            }}
          />
        </View>
      </ScreenScrollView>
    </ScreenCrashBoundary>
  );
}
