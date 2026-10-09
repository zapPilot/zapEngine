import { Link } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Tap } from '@/components/ui/Tap';
import { APP_ROUTES } from '@/integration/navigationModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function RuntimeAlertsLink() {
  const { t } = useContentLanguage();
  return (
    <Link href={APP_ROUTES.alerts} asChild>
      <Tap accessibilityRole="link" className="min-h-hit justify-center">
        <Text variant="action">{t('runtime.alerts')}</Text>
      </Tap>
    </Link>
  );
}
