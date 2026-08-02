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
import { getDepositReview } from '@zapengine/app-core/services';
import {
  STRATEGY_DEPOSIT_ID,
  type DepositReviewGroup,
  type PlanOrchestrationDepositReviewResponse,
  type PlanOrchestrationDepositPlan,
  type PlanOrchestrationDepositRequest,
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

interface InvestDepositPlanRequestParams {
  userAddress: `0x${string}`;
  scope: InvestScope;
  totalUsd6: string;
  baseFundingToken: DesktopDepositToken;
  arbitrumFundingToken: DesktopDepositToken;
  singleChainFundingDraft: SingleChainFundingDraft | null;
}

export function buildInvestDepositPlanRequest({
  userAddress,
  scope,
  totalUsd6,
  baseFundingToken,
  arbitrumFundingToken,
  singleChainFundingDraft,
}: InvestDepositPlanRequestParams): PlanOrchestrationDepositRequest | null {
  if (scope === 'both') {
    return {
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
    };
  }
  if (!singleChainFundingDraft || singleChainFundingDraft.scope !== scope) {
    return null;
  }
  if (singleChainFundingDraft.scope === 'base') {
    return {
      kind: 'invest',
      userAddress,
      fromToken: singleChainFundingDraft.fromToken,
      fromAmount: singleChainFundingDraft.fromAmount,
      sourceChainId: singleChainFundingDraft.chainId,
      split: { '8453': 1 },
    };
  }
  return {
    kind: 'gmx-v2',
    userAddress,
    marketKey: singleChainFundingDraft.marketKey,
    amount: singleChainFundingDraft.fromAmount,
  };
}

export function buildInvestDepositPlanPreviewKey(
  scope: InvestScope,
  request: PlanOrchestrationDepositRequest | null,
): readonly unknown[] {
  if (!request) {
    return [scope, 'no-frozen-draft'];
  }
  if (request.kind === 'strategy') {
    return [
      scope,
      request.totalUsd6,
      request.fundingSources[0].fromToken,
      request.fundingSources[1].fromToken,
    ];
  }
  if (request.kind === 'invest') {
    return [
      scope,
      request.sourceChainId,
      request.fromToken,
      request.fromAmount,
    ];
  }
  return [
    scope,
    42161,
    DEFAULT_ARBITRUM_FUNDING_TOKEN.depositAddress,
    request.amount,
    request.marketKey,
  ];
}

/**
 * Resolves which execution groups the current scope expects, keyed by the
 * group ids emitted by `/plan-orchestration/deposit/review`.
 */
function reviewGroupKeysFor(
  scope: InvestScope,
  plan: PlanOrchestrationDepositPlan | undefined,
): readonly string[] {
  if (scope === 'both') {
    return ['base-morpho', 'arbitrum-gmx'];
  }
  if (!plan) {
    return [];
  }
  const sourceChainId =
    'sourceChainId' in plan
      ? plan.sourceChainId
      : scope === 'base'
        ? 8453
        : 42161;
  return [`chain-${sourceChainId}`];
}

/**
 * Fetches the wallet-neutral Tenderly review used by the unified Step 2.
 * Unlike the legacy Privy preview this endpoint returns no signing envelope;
 * the review hashes bind the exact plan that the wallet executor may submit.
 */
export function useInvestDepositReview(): {
  review: PlanOrchestrationDepositReviewResponse | undefined;
  plan: PlanOrchestrationDepositPlan | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  retry: () => void;
  refresh: () => Promise<PlanOrchestrationDepositReviewResponse | undefined>;
  amountUsd: number;
  totalUsd6: string;
  /** Group ids this scope expects from the review response. */
  reviewGroupKeys: readonly string[];
  /** Groups present in the review response, in expected order. */
  reviewGroups: DepositReviewGroup[];
  /** True when every expected group is present in the review. */
  reviewHasAllGroups: boolean;
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
  const request = address
    ? buildInvestDepositPlanRequest({
        userAddress: address as `0x${string}`,
        scope,
        totalUsd6,
        baseFundingToken,
        arbitrumFundingToken,
        singleChainFundingDraft,
      })
    : null;
  const enabled = Boolean(
    address && request && amountUsd > 0 && totalUsd6 !== '0',
  );
  const requestKey = buildInvestDepositPlanPreviewKey(scope, request);
  const result = useQuery({
    queryKey: ['invest-deposit-review', address, ...requestKey],
    enabled,
    queryFn: async (): Promise<PlanOrchestrationDepositReviewResponse> => {
      if (!request) throw new Error('Deposit review request is unavailable');
      return getDepositReview(request);
    },
  });
  const plan = result.data?.plan;
  const reviewGroupKeys = reviewGroupKeysFor(scope, plan);
  const reviewGroups = reviewGroupKeys
    .map((key) => result.data?.reviews[key])
    .filter((group): group is DepositReviewGroup => Boolean(group));
  const reviewHasAllGroups =
    reviewGroupKeys.length > 0 &&
    reviewGroups.length === reviewGroupKeys.length;
  return {
    review: result.data,
    plan,
    isLoading: enabled && result.isLoading,
    isError: result.isError,
    errorMessage: result.error ? handleHTTPError(result.error) : null,
    retry: () => void result.refetch(),
    refresh: async () => {
      const refreshed = await result.refetch();
      return refreshed.data;
    },
    amountUsd,
    totalUsd6,
    reviewGroupKeys,
    reviewGroups,
    reviewHasAllGroups,
  };
}
