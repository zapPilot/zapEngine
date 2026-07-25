import { tokens } from '@zapengine/design-tokens/tokens';
import { useToast } from '@zapengine/app-core/providers/ToastContext';
import * as Clipboard from 'expo-clipboard';
import { Share2 } from 'lucide-react-native';
import type { ReactElement } from 'react';
import { Platform, Share } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import { buildBundleShareUrl } from '@/integration/bundleShareModel';
import { getBundleShareOrigin } from '@/integration/bundleShareOrigin';
import { useAccount } from '@/integration/useAccount';

/**
 * Shares a link to the signed-in user's own portfolio bundle
 * (`<origin>/home?userId=<uuid>`). Hidden while viewing someone else's bundle
 * or in demo mode — only the owner can share their own link. Web copies to the
 * clipboard (RN-web `Share` is unreliable); native opens the system share
 * sheet, mirroring the podcast episode share in `EpisodeDetailScreen`.
 */
export function SharePortfolioButton(): ReactElement | null {
  const account = useAccount();
  const { showToast } = useToast();

  if (!account.isOwnBundle || account.userId === null) {
    return null;
  }

  const userId = account.userId;
  const share = () => {
    const url = buildBundleShareUrl(getBundleShareOrigin(), userId);
    if (Platform.OS === 'web') {
      void Clipboard.setStringAsync(url).then(() =>
        showToast({ type: 'success', title: 'Link copied' }),
      );
      return;
    }
    void Share.share({
      title: 'My Zap Pilot portfolio',
      message: `My Zap Pilot portfolio\n${url}`,
      url,
    });
  };

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Share portfolio"
      className="h-[34px] w-[34px] items-center justify-center rounded-full border border-line bg-[rgba(255,255,255,.05)]"
      onPress={share}
    >
      <Share2 size={17} strokeWidth={1.8} color={tokens.color['ink-dim']} />
    </Tap>
  );
}
