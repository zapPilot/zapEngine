import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { handleHTTPError } from '@zapengine/app-core/lib/http';
import {
  getDepositPlan,
  getGmxDepositPlan,
  getStrategyDepositPlan,
} from '@zapengine/app-core/services';
import {
  STRATEGY_DEPOSIT_ID,
  type PlanOrchestrationDepositPlan,
} from '@zapengine/types/api';

import {
  DEFAULT_ARBITRUM_FUNDING_TOKEN,
  DEFAULT_BASE_FUNDING_TOKEN,
  type DesktopDepositToken,
} from '@/integration/depositTokens';
import {
  amountInputToUsd6,
  type InvestScope,
  type SingleChainFundingDraft,
} from '@/integration/investAmountModel';
import { useAccount } from '@/integration/useAccount';

export type {
  InvestScope,
  SingleChainFundingDraft,
} from '@/integration/investAmountModel';

export interface InvestContextValue {
  /** USD amount the user is investing (entered in step 1). */
  amountUsd: number;
  amountInput: string;
  setAmountInput: (value: string) => void;
  totalUsd6: string;
  scope: InvestScope;
  setScope: (value: InvestScope) => void;
  baseFundingToken: DesktopDepositToken;
  setBaseFundingToken: (value: DesktopDepositToken) => void;
  arbitrumFundingToken: DesktopDepositToken;
  setArbitrumFundingToken: (value: DesktopDepositToken) => void;
  singleChainFundingDraft: SingleChainFundingDraft | null;
  setSingleChainFundingDraft: (value: SingleChainFundingDraft | null) => void;
}

const InvestContext = createContext<InvestContextValue | null>(null);

/**
 * Holds the invest-flow draft (the USD amount) so the amount, route, and
 * confirm steps share one source of truth. Wrapped around the three
 * `/invest/*` routes via a layout route.
 */
export function InvestProvider({ children }: { children: ReactNode }) {
  const [amountInput, setAmountInputState] = useState('');
  const [scope, setScopeState] = useState<InvestScope>('both');
  const amountUsd = Number.parseFloat(amountInput.replace(/,/gu, '')) || 0;
  const [baseFundingToken, setBaseFundingTokenState] =
    useState<DesktopDepositToken>(DEFAULT_BASE_FUNDING_TOKEN);
  const [arbitrumFundingToken, setArbitrumFundingTokenState] =
    useState<DesktopDepositToken>(DEFAULT_ARBITRUM_FUNDING_TOKEN);
  const [singleChainFundingDraft, setSingleChainFundingDraft] =
    useState<SingleChainFundingDraft | null>(null);

  const setAmountInput = useCallback((value: string) => {
    setAmountInputState(value);
    setSingleChainFundingDraft(null);
  }, []);
  const setScope = useCallback((value: InvestScope) => {
    setScopeState(value);
    setSingleChainFundingDraft(null);
  }, []);
  const setBaseFundingToken = useCallback((value: DesktopDepositToken) => {
    setBaseFundingTokenState(value);
    setSingleChainFundingDraft(null);
  }, []);
  const setArbitrumFundingToken = useCallback((value: DesktopDepositToken) => {
    setArbitrumFundingTokenState(value);
    setSingleChainFundingDraft(null);
  }, []);

  const value = useMemo<InvestContextValue>(
    () => ({
      amountUsd,
      amountInput,
      setAmountInput,
      totalUsd6: amountInputToUsd6(amountInput),
      scope,
      setScope,
      baseFundingToken,
      setBaseFundingToken,
      arbitrumFundingToken,
      setArbitrumFundingToken,
      singleChainFundingDraft,
      setSingleChainFundingDraft,
    }),
    [
      amountInput,
      amountUsd,
      arbitrumFundingToken,
      baseFundingToken,
      scope,
      setAmountInput,
      setArbitrumFundingToken,
      setBaseFundingToken,
      setScope,
      singleChainFundingDraft,
    ],
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
  plan: PlanOrchestrationDepositPlan | undefined;
  isLoading: boolean;
  isError: boolean;
  /** Human-readable backend failure reason (plan 4xx/5xx body), or null. */
  errorMessage: string | null;
  retry: () => void;
  amountUsd: number;
  totalUsd6: string;
} {
  const { address } = useAccount();
  const {
    amountUsd,
    totalUsd6,
    scope,
    baseFundingToken,
    arbitrumFundingToken,
    singleChainFundingDraft,
  } = useInvest();
  const hasMatchingSingleChainDraft =
    scope !== 'both' && singleChainFundingDraft?.scope === scope;
  const enabled = Boolean(
    address &&
    amountUsd > 0 &&
    totalUsd6 !== '0' &&
    (scope === 'both' || hasMatchingSingleChainDraft),
  );
  const requestKey =
    scope === 'both'
      ? [
          scope,
          totalUsd6,
          baseFundingToken.depositAddress,
          arbitrumFundingToken.depositAddress,
        ]
      : singleChainFundingDraft?.scope === scope
        ? [
            singleChainFundingDraft.scope,
            singleChainFundingDraft.chainId,
            singleChainFundingDraft.fromToken,
            singleChainFundingDraft.fromAmount,
            singleChainFundingDraft.scope === 'arbitrum'
              ? singleChainFundingDraft.marketKey
              : null,
          ]
        : [scope, 'no-frozen-draft'];
  const result = useQuery({
    queryKey: ['invest-deposit-plan-preview', address, ...requestKey],
    enabled,
    queryFn: (): Promise<PlanOrchestrationDepositPlan> => {
      const userAddress = address as `0x${string}`;
      if (scope === 'both') {
        return getStrategyDepositPlan({
          kind: 'strategy',
          strategyId: STRATEGY_DEPOSIT_ID,
          userAddress,
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
        });
      }
      if (!singleChainFundingDraft || singleChainFundingDraft.scope !== scope) {
        throw new Error('Single-chain funding draft is unavailable');
      }
      if (singleChainFundingDraft.scope === 'base') {
        return getDepositPlan({
          kind: 'invest',
          userAddress,
          fromToken: singleChainFundingDraft.fromToken,
          fromAmount: singleChainFundingDraft.fromAmount,
          sourceChainId: singleChainFundingDraft.chainId,
          split: { '8453': 1 },
        });
      }
      return getGmxDepositPlan({
        kind: 'gmx-v2',
        userAddress,
        marketKey: singleChainFundingDraft.marketKey,
        amount: singleChainFundingDraft.fromAmount,
      });
    },
  });
  return {
    plan: result.data,
    isLoading: enabled && result.isLoading,
    isError: result.isError,
    errorMessage: result.error ? handleHTTPError(result.error) : null,
    retry: () => void result.refetch(),
    amountUsd,
    totalUsd6,
  };
}
