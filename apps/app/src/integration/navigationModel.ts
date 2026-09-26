export type AppTabName =
  | 'home'
  | 'strategy'
  | 'podcast'
  | 'ai-wallet'
  | 'account';

export const DEFAULT_APP_TAB: AppTabName = 'podcast';
export const DEFAULT_APP_TAB_PATH = '/podcast' as const;

export const APP_TAB_NAMES: readonly AppTabName[] = [
  'home',
  'strategy',
  'podcast',
  'ai-wallet',
  'account',
];

const GUEST_ACCESSIBLE_TABS = new Set<AppTabName>([
  'home',
  'podcast',
  'ai-wallet',
]);

export function isTabAccessible(
  tabName: AppTabName,
  isConnected: boolean,
): boolean {
  return isConnected || GUEST_ACCESSIBLE_TABS.has(tabName);
}
