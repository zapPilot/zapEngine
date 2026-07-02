import { Outlet, useLocation } from 'react-router-dom';

import { BottomTabBar } from '@/components/BottomTabBar';
import { ConnectGate } from '@/components/ConnectGate';
import { PhoneFrame } from '@/components/PhoneFrame';
import { useAccount } from '@/integration/useAccount';

/**
 * Shared layout: the centered phone frame with a scrollable content region and
 * a persistent bottom tab bar. The 3-step invest flow hides the tab bar, and
 * wallet-backed tabs are gated behind a connection; the podcast tab stays
 * public.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const { isConnected } = useAccount();
  // Podcast needs no wallet: keep it (and the tab bar) reachable pre-connect
  // so the daily-listening loop works without signing in.
  const isPublicRoute = pathname.startsWith('/podcast');
  const hideTabBar =
    pathname.startsWith('/invest') ||
    pathname.startsWith('/send') ||
    (!isConnected && !isPublicRoute);

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="zp-scroll flex-1 overflow-y-auto">
          {isConnected || isPublicRoute ? <Outlet /> : <ConnectGate />}
        </div>
        {!hideTabBar && <BottomTabBar />}
      </div>
    </PhoneFrame>
  );
}
