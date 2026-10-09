import { useCallback } from 'react';
import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useToast } from '@zapengine/app-core/providers/ToastContext';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
/** Both public sharing surfaces use one clipboard/native-share contract. */
export function useShareLink(title: string) {
  const { t } = useContentLanguage();
  const { showToast } = useToast();
  return useCallback(
    (url: string) => {
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
          .catch(() =>
            showToast({ type: 'error', title: t('home.shareError') }),
          );
        return;
      }
      void Share.share({ title, message: [title, url].join('\n'), url }).catch(
        () => showToast({ type: 'error', title: t('home.shareError') }),
      );
    },
    [title, showToast, t],
  );
}
