import { resolveShareOrigin } from '@/integration/bundleShareModel';

/**
 * Web half of the share-origin platform split: share links use the live page
 * origin so dev builds produce localhost links and prod builds the real host.
 * The static export prerenders without a window — fall back to the default.
 */
export function getBundleShareOrigin(): string {
  return resolveShareOrigin(
    typeof window === 'undefined' ? null : window.location.origin,
  );
}
