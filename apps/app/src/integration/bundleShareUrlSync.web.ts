import { usePathname } from 'expo-router';
import { type ReactElement, useEffect, useRef, useState } from 'react';

import { resolveOwnBundleUrlSearch } from '@/integration/bundleShareModel';
import { getBundleViewUserId } from '@/integration/bundleViewParam';
import { useAccount } from '@/integration/useAccount';

/**
 * Web half of the bundle-share URL sync: isolates `?userId=<own-uuid>` on
 * portfolio routes. The component skips its effect until the first animation
 * frame after mount so it never races with expo-router's own initial redirect
 * (e.g. `/` → `/podcast`).
 */
export function OwnBundleUrlSync(): ReactElement | null {
  const pathname = usePathname();
  const { userId } = useAccount();
  const [ready, setReady] = useState(false);
  const userIdRef = useRef(userId);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (typeof window === 'undefined') return;
    userIdRef.current = userId;
  }, [ready, userId]);

  useEffect(() => {
    if (!ready) return;
    if (typeof window === 'undefined') return;
    const userId = userIdRef.current;
    const { pathname: locationPathname, search, hash } = window.location;
    const next = resolveOwnBundleUrlSearch({
      pathname: locationPathname,
      search,
      latchedUrlUserId: getBundleViewUserId(),
      ownUserId: userId,
    });
    if (next === null) return;
    const query = next ? `?${next}` : '';
    window.history.replaceState(
      window.history.state,
      '',
      `${locationPathname}${query}${hash}`,
    );
  }, [pathname, ready]);

  return null;
}