import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { getStrategyDepositPlan } from '@zapengine/app-core/services';
import {
  STRATEGY_DEPOSIT_ID,
  type StrategyDepositPlan,
} from '@zapengine/types/api';

import {
  DEFAULT_ARBITRUM_FUNDING_TOKEN,
  DEFAULT_BASE_FUNDING_TOKEN,
  type DesktopDepositToken,
} from '@/integration/depositTokens';
import { amountInputToUsd6 } from '@/integration/investAmountModel';
import { useAccount } from '@/integration/useAccount';

export interface InvestContextValue {
  /** USD amount the user is investing (entered in step 1). */
  amountUsd: number;
  amountInput: string;
  setAmountInput: (value: string) => void;
  totalUsd6: string;
  baseFundingToken: DesktopDepositToken;
  setBaseFundingToken: (value: DesktopDepositToken) => void;
  arbitrumFundingToken: DesktopDepositToken;
  setArbitrumFundingToken: (value: DesktopDepositToken) => void;
}

const InvestContext = createContext<InvestContextValue | null>(null);

/**
 * Holds the invest-flow draft (the USD amount) so the amount, route, and
 * confirm steps share one source of truth. Wrapped around the three
 * `/invest/*` routes via a layout route.
 */
export function InvestProvider({ children }: { children: ReactNode }) {
  const [amountInput, setAmountInput] = useState('');
  const amountUsd = Number.parseFloat(amountInput.replace(/,/gu, '')) || 0;
  const [baseFundingToken, setBaseFundingToken] = useState<DesktopDepositToken>(
    DEFAULT_BASE_FUNDING_TOKEN,
  );
  const [arbitrumFundingToken, setArbitrumFundingToken] =
    useState<DesktopDepositToken>(DEFAULT_ARBITRUM_FUNDING_TOKEN);

  const value = useMemo<InvestContextValue>(
    () => ({
      amountUsd,
      amountInput,
      setAmountInput,
      totalUsd6: amountInputToUsd6(amountInput),
      baseFundingToken,
      setBaseFundingToken,
      arbitrumFundingToken,
      setArbitrumFundingToken,
    }),
    [amountInput, amountUsd, arbitrumFundingToken, baseFundingToken],
  );

  return (
    <InvestContext.Provider value={value}>{children}</InvestContext.Provider>
  );
}

export function useInvest(): InvestContextValue {
  const context = useContext(InvestContext);
  if (!context) {
    throw new Error('useInvest must be used within an InvestProvider');
  }
  return context;
}

/**
 * Shares one strategy-plan query across the route and confirm screens.
 */
export function useInvestDepositPlanPreview(): {
  plan: StrategyDepositPlan | undefined;
  isLoading: boolean;
  isError: boolean;
  amountUsd: number;
  totalUsd6: string;
} {
  const { address } = useAccount();
  const { amountUsd, totalUsd6, baseFundingToken, arbitrumFundingToken } =
    useInvest();
  const enabled = Boolean(address && amountUsd > 0 && totalUsd6 !== '0');
  const result = useQuery({
    queryKey: [
      'strategy-deposit-plan-preview',
      address,
      totalUsd6,
      baseFundingToken.depositAddress,
      arbitrumFundingToken.depositAddress,
    ],
    enabled,
    queryFn: () =>
      getStrategyDepositPlan({
        kind: 'strategy',
        strategyId: STRATEGY_DEPOSIT_ID,
        userAddress: address as `0x${string}`,
        totalUsd6,
        fundingSources: [
          {
            chainId: 8453,
            fromToken: baseFundingToken.depositAddress,
          },
          {
            chainId: 42161,
            fromToken: arbitrumFundingToken.depositAddress,
          },
        ],
      }),
  });
  return {
    plan: result.data,
    isLoading: enabled && result.isLoading,
    isError: result.isError,
    amountUsd,
    totalUsd6,
  };
}
