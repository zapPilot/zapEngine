import { House, Sparkles, Headphones, User } from 'lucide-react-native';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { useTabAccess } from '@/integration/useTabAccess';
const tabs = [
  { name: 'home', labelKey: 'tabs.home', icon: House, href: '/home' },
  {
    name: 'strategy',
    labelKey: 'tabs.strategy',
    icon: Sparkles,
    href: '/strategy',
  },
  {
    name: 'podcast',
    labelKey: 'tabs.podcast',
    icon: Headphones,
    href: '/podcast',
  },
  { name: 'account', labelKey: 'tabs.account', icon: User, href: '/account' },
] as const;
export function useAppTabs() {
  const { t } = useContentLanguage();
  const access = useTabAccess();
  return {
    tabs: tabs.map((tab) => ({
      ...tab,
      label: t(tab.labelKey),
      accessible: access.isAccessible(tab.name),
      hint: access.isAccessible(tab.name) ? undefined : t('tabs.signInHint'),
    })),
    access,
  };
}
