import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/app/AppShell';
import { InvestProvider } from '@/integration/useInvest';
import { AccountScreen } from '@/routes/AccountScreen';
import { ActivityScreen } from '@/routes/ActivityScreen';
import { HomeScreen } from '@/routes/HomeScreen';
import { InvestAmountScreen } from '@/routes/InvestAmountScreen';
import { InvestConfirmScreen } from '@/routes/InvestConfirmScreen';
import { InvestRouteScreen } from '@/routes/InvestRouteScreen';
import { PortfolioScreen } from '@/routes/PortfolioScreen';
import { StrategyScreen } from '@/routes/StrategyScreen';

/**
 * Top-level route tree for the desktop app. All screens render inside the
 * centered phone frame (`AppShell`); the invest flow hides the bottom tab bar.
 */
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/home" element={<HomeScreen />} />
        <Route path="/portfolio" element={<PortfolioScreen />} />
        <Route path="/strategy" element={<StrategyScreen />} />
        <Route path="/activity" element={<ActivityScreen />} />
        <Route path="/account" element={<AccountScreen />} />
        <Route
          element={
            <InvestProvider>
              <Outlet />
            </InvestProvider>
          }
        >
          <Route path="/invest/amount" element={<InvestAmountScreen />} />
          <Route path="/invest/route" element={<InvestRouteScreen />} />
          <Route path="/invest/confirm" element={<InvestConfirmScreen />} />
        </Route>
        <Route
          path="/invest"
          element={<Navigate to="/invest/amount" replace={true} />}
        />
      </Route>
      <Route path="/" element={<Navigate to="/home" replace={true} />} />
      <Route path="*" element={<Navigate to="/home" replace={true} />} />
    </Routes>
  );
}
