import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export function useDemoGateCopy() {
  const { t } = useContentLanguage();
  return {
    title: t('home.iosReadOnlyConnectTitle'),
    body: t('home.iosReadOnlyConnectBody'),
  };
}
