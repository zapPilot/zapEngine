import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { PageHeader } from '@/components/ui/PageHeader';
import { IconButton } from '@/components/ui/IconButton';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';
import { TelegramCard } from '@/components/account/TelegramCard';
import { AuthenticatedRoute } from '@/components/auth/AuthenticatedRoute';
import { APP_ROUTES } from '@/integration/navigationModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function RuntimeAlertsScreen() {
  const router = useRouter();
  const { t } = useContentLanguage();
  return (
    <ScreenScrollView width="narrow">
      <PageHeader
        title={t('runtime.alerts')}
        leading={
          <IconButton
            icon={ChevronLeft}
            accessibilityLabel={t('common.back')}
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace(APP_ROUTES.runtime)
            }
          />
        }
      />
      <AuthenticatedRoute>
        <TelegramCard />
      </AuthenticatedRoute>
    </ScreenScrollView>
  );
}
