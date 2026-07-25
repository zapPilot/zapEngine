import type { ReactElement } from 'react';

/**
 * Native half of the bundle-share URL sync platform split: there is no address
 * bar to keep in step, so this renders nothing.
 */
export function OwnBundleUrlSync(): ReactElement | null {
  return null;
}
