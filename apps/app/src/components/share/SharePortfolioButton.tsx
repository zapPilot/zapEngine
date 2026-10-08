import { Icon } from '@/components/ui/Icon';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { useToast } from '@zapengine/app-core/providers/ToastContext';
import * as Clipboard from 'expo-clipboard';
import { Share2 } from 'lucide-react-native';
import type { ReactElement } from 'react';
import { Platform, Share } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import { buildBundleShareUrl } from '@/integration/bundleShareModel';
import { getBundleShareOrigin } from '@/integration/bundleShareOrigin';
import { useAccount } from '@/integration/useAccount';

/** Share the displayed public bundle through the clipboard or native share sheet. */
export function SharePortfolioButton(): ReactElement | null {
  const account = useAccount();
  const { t } = useContentLanguage();
  const { showToast } = useToast();

  if (account.isDemo || account.viewingUserId === null) {
    return null;
  }

  const userId = account.viewingUserId;
  const share = () => {
    const url = buildBundleShareUrl(getBundleShareOrigin(), userId);
    if (Platform.OS === 'web') {
      void Clipboard.setStringAsync(url)
        .then((copied) => {
          if (!copied) throw new Error('Clipboard write failed');
          showToast({
            type: 'success',
            title: t('home.shareCopied'),
            message: t('home.sharePublic'),
          });
        })
        .catch(() => showToast({ type: 'error', title: t('home.shareError') }));
      return;
    }
    void Share.share({
      title: t('home.shareTitle'),
      message: `${t('home.shareTitle')}\n${url}`,
      url,
    }).catch(() => showToast({ type: 'error', title: t('home.shareError') }));
  };

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={t('home.sharePortfolio')}
      className="h-[34px] w-[34px] items-center justify-center rounded-round border border-rule bg-well"
      onPress={share}
    >
      <Icon icon={Share2} size="md" tone="secondary" />
    </Tap>
  );
}
