import { usePathname } from 'expo-router';
import { type ReactElement, useEffect } from 'react';

import { resolveBundleUrlSearch } from '@/integration/bundleShareModel';
import { useAccount } from '@/integration/useAccount';

/** Sync the displayed bundle after Expo commits each navigation to history. */
export function BundleUrlSync(): ReactElement | null {
  const pathname = usePathname();
  const { viewingUserId } = useAccount();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Expo linking writes history in its own frame after navigation settles.
    // Run after that frame so it cannot overwrite the displayed bundle.
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        const { pathname: locationPathname, search, hash } = window.location;
        const next = resolveBundleUrlSearch({
          pathname: locationPathname,
          search,
          viewingUserId,
        });
        if (next === null) return;
        const query = next ? `?${next}` : '';
        window.history.replaceState(
          window.history.state,
          '',
          `${locationPathname}${query}${hash}`,
        );
      });
    });
    return () => cancelAnimationFrame(id);
  }, [pathname, viewingUserId]);
  return null;
}
