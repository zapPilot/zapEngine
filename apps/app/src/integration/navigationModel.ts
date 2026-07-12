export type AppTabName =
  | 'home'
  | 'strategy'
  | 'podcast'
  | 'activity'
  | 'account';

export const APP_TAB_NAMES: readonly AppTabName[] = [
  'home',
  'strategy',
  'podcast',
  'activity',
  'account',
];

const GUEST_ACCESSIBLE_TABS = new Set<AppTabName>(['home', 'podcast']);

export function isTabAccessible(
  tabName: AppTabName,
  isConnected: boolean,
): boolean {
  return isConnected || GUEST_ACCESSIBLE_TABS.has(tabName);
}
