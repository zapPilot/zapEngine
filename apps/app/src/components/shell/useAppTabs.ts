import { APP_ROUTES, APP_TAB_NAMES } from '@/integration/navigationModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function useAppTabs() {
  const { t } = useContentLanguage();
  return {
    tabs: APP_TAB_NAMES.map((name) => ({
      name,
      href: APP_ROUTES[name],
      label: t(`tabs.${name}`),
    })),
  };
}
