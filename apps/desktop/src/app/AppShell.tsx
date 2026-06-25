import { Outlet, useLocation } from 'react-router-dom';

import { BottomTabBar } from '@/components/BottomTabBar';
import { PhoneFrame } from '@/components/PhoneFrame';

/**
 * Shared layout: the centered phone frame with a scrollable content region and
 * a persistent bottom tab bar. The 3-step invest flow hides the tab bar.
 */
export function AppShell() {
  const { pathname } = useLocation();
  const hideTabBar = pathname.startsWith('/invest');

  return (
    <PhoneFrame>
      <div className="flex h-full flex-col">
        <div className="zp-scroll flex-1 overflow-y-auto">
          <Outlet />
        </div>
        {!hideTabBar && <BottomTabBar />}
      </div>
    </PhoneFrame>
  );
}
