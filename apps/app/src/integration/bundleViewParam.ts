/**
 * Native no-op half of the bundle-view platform split. The public
 * `?userId=` bundle view only exists on web (there is no page URL to carry
 * the param on native), so the native bundle ships a null stub — see
 * bundleViewParam.web.ts for the real implementation.
 */

/** Bundle-view user id from the page URL (web only). */
export function getBundleViewUserId(): string | null {
  return null;
}
