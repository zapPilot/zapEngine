import { Outlet, useLocation } from 'react-router-dom';

import { BottomTabBar } from '@/components/BottomTabBar';
import { ConnectGate } from '@/components/ConnectGate';
import { PhoneFrame } from '@/components/PhoneFrame';
import { useAccount } from '@/integration/useAccount';

/**
 * Shared layout: the centered phone frame with a scrollable content region and
 * a persistent bottom tab bar. The 3-step invest flow hides the tab bar, and
 * the whole tab UI is gated behind a wallet connection.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const { isConnected } = useAccount();
  const hideTabBar = pathname.startsWith('/invest') || !isConnected;

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="zp-scroll flex-1 overflow-y-auto">
          {isConnected ? <Outlet /> : <ConnectGate />}
        </div>
        {!hideTabBar && <BottomTabBar />}
      </div>
    </PhoneFrame>
  );
}
