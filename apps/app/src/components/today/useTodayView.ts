import { Platform } from 'react-native';
import { useTodayPortfolio } from './useTodayPortfolio';
import { useTodayDecision } from '@/integration/useTodayDecision';
import type { defaultPortfolioRules } from '@/integration/referenceStrategyModel';
import { useFundFlow } from '@/providers/FundFlowProvider';
const EMPTY_RULES: ReturnType<typeof defaultPortfolioRules> = [];
/** Today and its detail page share the exact portfolio subject and verdict source. */
export function useTodayView() {
  const portfolio = useTodayPortfolio();
  const { account } = portfolio;
  const decision = useTodayDecision({
    platformOS: Platform.OS,
    isConnected: account.isConnected,
    netWorth: portfolio.result.data.home.totalBalance,
    netWorthLoading:
      (portfolio.result.balance.isLoading || account.isResolvingViewingUser) &&
      !account.isUserResolutionFailed,
    userId: account.viewingUserId,
  });
  const fund = useFundFlow();
  return {
    portfolio,
    account,
    decision,
    fund,
    rules: decision.reference.data?.rules ?? EMPTY_RULES,
  };
}
