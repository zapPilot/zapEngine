export const APP_ROUTES = {
  today: '/today',
  decision: '/today/decision',
  listen: '/listen',
  runtime: '/runtime',
  wallet: '/runtime?section=wallet',
  alerts: '/runtime/alerts',
  portfolio: '/portfolio',
  wallets: '/wallets',
  welcome: '/welcome',
} as const;

export const APP_TAB_NAMES = ['today', 'listen', 'runtime'] as const;
export type AppTabName = (typeof APP_TAB_NAMES)[number];

export function defaultTabFor(platform: string): AppTabName {
  return platform === 'ios' ? 'listen' : 'today';
}

export function activeAppTabForPathname(pathname: string): AppTabName | null {
  const path = pathname.replace(/\?.*$/, '').replace(/\/$/, '');
  if (
    path === APP_ROUTES.today ||
    path.startsWith(`${APP_ROUTES.today}/`) ||
    path === APP_ROUTES.portfolio
  )
    return 'today';
  if (
    path === APP_ROUTES.listen ||
    path === '/e' ||
    path.startsWith('/e/') ||
    path.startsWith('/podcast/')
  )
    return 'listen';
  if (
    path === APP_ROUTES.runtime ||
    path.startsWith(`${APP_ROUTES.runtime}/`) ||
    path === APP_ROUTES.wallets
  )
    return 'runtime';
  return null;
}

export function resolveLandingPath({
  platformOS,
  hasBundleView,
  wasSignedIn,
  hasSeenFirstRun,
}: {
  platformOS: string;
  hasBundleView: boolean;
  wasSignedIn: boolean;
  hasSeenFirstRun: boolean;
}): '/today' | '/listen' | '/welcome' {
  if (hasBundleView) return APP_ROUTES.today;
  if (platformOS === 'ios') return APP_ROUTES.listen;
  if (wasSignedIn || hasSeenFirstRun) return APP_ROUTES.today;
  return APP_ROUTES.welcome;
}
