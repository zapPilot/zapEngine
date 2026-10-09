import { Share2 } from 'lucide-react-native';
import { IconButton } from '@/components/ui/IconButton';
import { buildBundleShareUrl } from '@/integration/bundleShareModel';
import { getBundleShareOrigin } from '@/integration/bundleShareOrigin';
import { useAccount } from '@/integration/useAccount';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { useShareLink } from './useShareLink';
export function SharePortfolioButton() {
  const account = useAccount();
  const { t } = useContentLanguage();
  const share = useShareLink(t('home.shareTitle'));
  if (account.isDemo || account.viewingUserId === null) return null;
  const userId = account.viewingUserId;
  return (
    <IconButton
      icon={Share2}
      accessibilityLabel={t('home.sharePortfolio')}
      onPress={() => share(buildBundleShareUrl(getBundleShareOrigin(), userId))}
    />
  );
}
