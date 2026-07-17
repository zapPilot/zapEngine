import { parseBundleViewUserId } from './bundleViewModel';

/**
 * Web half of the bundle-view platform split: reads `?userId=` from the page
 * URL. The value is latched on first call — expo-router pushes drop the query
 * string, so the bundle view must survive tab navigation. A page reload
 * re-captures the param.
 */

let latched = false;
let latchedUserId: string | null = null;

export function getBundleViewUserId(): string | null {
  if (!latched) {
    // Expo static export prerenders without a window; skip latching so the
    // browser runtime still captures the param on its first call.
    if (typeof window === 'undefined') {
      return null;
    }
    latchedUserId = parseBundleViewUserId(window.location.search);
    latched = true;
  }
  return latchedUserId;
}
