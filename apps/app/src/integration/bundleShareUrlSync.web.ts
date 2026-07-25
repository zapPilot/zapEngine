import { usePathname } from 'expo-router';
import { type ReactElement, useEffect } from 'react';

import { resolveOwnBundleUrlSearch } from '@/integration/bundleShareModel';
import { getBundleViewUserId } from '@/integration/bundleViewParam';
import { useAccount } from '@/integration/useAccount';

/**
 * Web half of the bundle-share URL sync: keeps `?userId=<own-uuid>` in the
 * address bar on portfolio routes so copying the URL is enough to share the
 * bundle — no button press needed. expo-router pushes drop the query string,
 * so this re-applies it whenever the pathname changes (e.g. returning to /home
 * from another tab). A visited user's `?userId=` is never overwritten — the
 * bundle-view latch (`getBundleViewUserId`) wins, and `replaceState` never
 * feeds back into it because the latch is read once at page load.
 *
 * `usePathname()` is the change trigger only; the decision and the written URL
 * both read from `window.location`. During a tab switch expo-router's pathname
 * briefly lags `window.location`, so mixing the two would build a URL for one
 * route from a decision about another (e.g. stamping `?userId=` onto /podcast).
 */
export function OwnBundleUrlSync(): ReactElement | null {
  const pathname = usePathname();
  const { userId } = useAccount();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const { pathname: locationPathname, search, hash } = window.location;
    const next = resolveOwnBundleUrlSearch({
      pathname: locationPathname,
      search,
      latchedUrlUserId: getBundleViewUserId(),
      ownUserId: userId,
    });
    if (next === null) {
      return;
    }
    const query = next ? `?${next}` : '';
    window.history.replaceState(
      window.history.state,
      '',
      `${locationPathname}${query}${hash}`,
    );
    // `pathname` (expo-router) is intentionally a trigger-only dependency: it
    // fires this effect on navigation while the logic reads window.location.
  }, [pathname, userId]);

  return null;
}
