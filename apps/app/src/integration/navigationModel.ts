export type AppTabName = 'home' | 'strategy' | 'podcast' | 'account';

export const DEFAULT_APP_TAB: AppTabName = 'podcast';
export const DEFAULT_APP_TAB_PATH = '/podcast' as const;

export const APP_TAB_NAMES: readonly AppTabName[] = [
  'home',
  'strategy',
  'podcast',
  'account',
];

const GUEST_ACCESSIBLE_TABS = new Set<AppTabName>(['home', 'podcast']);

export function isTabAccessible(
  tabName: AppTabName,
  isConnected: boolean,
): boolean {
  return isConnected || GUEST_ACCESSIBLE_TABS.has(tabName);
}

export function activeAppTabForPathname(pathname: string): AppTabName | null {
  const path = pathname.replace(/\?.*$/, '').replace(/\/$/, '');
  if (
    path === '/home' ||
    path === '/portfolio' ||
    path === '/send' ||
    path === '/invest' ||
    path.startsWith('/invest/')
  )
    return 'home';
  if (path === '/strategy') return 'strategy';
  if (
    path === '/podcast' ||
    path.startsWith('/podcast/') ||
    path === '/e' ||
    path.startsWith('/e/')
  )
    return 'podcast';
  if (path === '/account' || path === '/wallets') return 'account';
  return null;
}
export function resolveLandingPath({
  platformOS,
  hasBundleView,
  wasSignedIn,
}: {
  platformOS: string;
  hasBundleView: boolean;
  wasSignedIn: boolean;
}): '/home' | '/podcast' {
  if (hasBundleView) return '/home';
  return platformOS !== 'ios' && wasSignedIn ? '/home' : '/podcast';
}
