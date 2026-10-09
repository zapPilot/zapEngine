import { Share2 } from 'lucide-react-native';
import { IconButton } from '@/components/ui/IconButton';
import { useShareLink } from '@/components/share/useShareLink';
import { getBundleShareOrigin } from '@/integration/bundleShareOrigin';
import { APP_ROUTES } from '@/integration/navigationModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function ShareDecisionButton() {
  const { t } = useContentLanguage();
  const share = useShareLink(t('decision.title'));
  return (
    <IconButton
      icon={Share2}
      accessibilityLabel={t('decision.share')}
      onPress={() =>
        share(new URL(APP_ROUTES.decision, getBundleShareOrigin()).toString())
      }
    />
  );
}
