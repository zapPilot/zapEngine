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
  HYPERCORE_CHAIN_ID,
  STRATEGY_DEPOSIT_ID,
  type ChainSplit,
  type DepositReviewGroup,
  type PlanOrchestrationDepositReviewResponse,
  type ReviewedDepositPlan,
  type ReviewedDepositRequest,
} from '@zapengine/types/api';

import {
  DEFAULT_ARBITRUM_FUNDING_TOKEN,
  DEFAULT_BASE_FUNDING_TOKEN,
  type DesktopDepositToken,
} from '@/integration/depositTokens';
import {
  amountInputToUsd6,
  amountUsdFromInput,
  type InvestScope,
  type SingleChainFundingDraft,
} from '@/integration/investAmountModel';
import { useAccount } from '@/integration/useAccount';

export type {
  InvestScope,
  SingleChainFundingDraft,
} from '@/integration/investAmountModel';

export type InvestDestination = 'strategy' | 'hlp';

/**
 * Frozen HLP draft funded from HyperCore rather than an EVM chain. Kept
 * separate from `SingleChainFundingDraft`, which carries a source chain id
 * and token address that a HyperCore-funded deposit simply does not have.
 */
export interface HyperCoreFundingDraft {
  source: 'hypercore-spot';
  requestedUsd6: string;
}

export interface InvestContextValue {
  /** USD amount the user is investing (entered in step 1). */
  amountUsd: number;
  amountInput: string;
  setAmountInput: (value: string) => void;
  totalUsd6: string;
  scope: InvestScope;
  setScope: (value: InvestScope) => void;
  destination: InvestDestination;
  setDestination: (value: InvestDestination) => void;
  baseFundingToken: DesktopDepositToken;
  setBaseFundingToken: (value: DesktopDepositToken) => void;
  arbitrumFundingToken: DesktopDepositToken;
  setArbitrumFundingToken: (value: DesktopDepositToken) => void;
  singleChainFundingDraft: SingleChainFundingDraft | null;
  setSingleChainFundingDraft: (value: SingleChainFundingDraft | null) => void;
  hyperCoreFundingDraft: HyperCoreFundingDraft | null;
  setHyperCoreFundingDraft: (value: HyperCoreFundingDraft | null) => void;
  /** Perp USDC snapshot taken immediately before a reviewed HLP bridge batch. */
  hlpBaselineUsd6: string | null;
  setHlpBaselineUsd6: (value: string | null) => void;
}

const InvestContext = createContext<InvestContextValue | null>(null);

// Wraps a plain state setter so any further edit to the draft drops the
// frozen single-chain amount/baseline computed for the previous input.
function withFreezeClear<T>(
  setter: (value: T) => void,
  clearFrozenExecution: () => void,
  value: T,
): void {
  setter(value);
  clearFrozenExecution();
}

/**
 * Holds the invest-flow draft (the USD amount) so the amount, route, and
 * confirm steps share one source of truth. Wrapped around the three
 * `/invest/*` routes via a layout route.
 */
export function InvestProvider({ children }: { children: ReactNode }) {
  const [amountInput, setAmountInputState] = useState('');
  const [scope, setScopeState] = useState<InvestScope>('both');
  const [destination, setDestinationState] =
    useState<InvestDestination>('strategy');
  const amountUsd = amountUsdFromInput(amountInput) ?? 0;
  const [baseFundingToken, setBaseFundingTokenState] =
    useState<DesktopDepositToken>(DEFAULT_BASE_FUNDING_TOKEN);
  const [arbitrumFundingToken, setArbitrumFundingTokenState] =
    useState<DesktopDepositToken>(DEFAULT_ARBITRUM_FUNDING_TOKEN);
  const [singleChainFundingDraft, setSingleChainFundingDraft] =
    useState<SingleChainFundingDraft | null>(null);
  const [hyperCoreFundingDraft, setHyperCoreFundingDraft] =
    useState<HyperCoreFundingDraft | null>(null);
  const [hlpBaselineUsd6, setHlpBaselineUsd6] = useState<string | null>(null);

  const clearFrozenExecution = useCallback(() => {
    setSingleChainFundingDraft(null);
    setHyperCoreFundingDraft(null);
    setHlpBaselineUsd6(null);
  }, []);
  const setAmountInput = useCallback(
    (value: string) =>
      withFreezeClear(setAmountInputState, clearFrozenExecution, value),
    [clearFrozenExecution],
  );
  const setScope = useCallback(
    (value: InvestScope) => {
      setScopeState(value);
      setDestinationState('strategy');
      clearFrozenExecution();
    },
    [clearFrozenExecution],
  );
  const setDestination = useCallback(
    (value: InvestDestination) =>
      withFreezeClear(setDestinationState, clearFrozenExecution, value),
    [clearFrozenExecution],
  );
  const setBaseFundingToken = useCallback(
    (value: DesktopDepositToken) =>
      withFreezeClear(setBaseFundingTokenState, clearFrozenExecution, value),
    [clearFrozenExecution],
  );
  const setArbitrumFundingToken = useCallback(
    (value: DesktopDepositToken) =>
      withFreezeClear(
        setArbitrumFundingTokenState,
        clearFrozenExecution,
        value,
      ),
    [clearFrozenExecution],
  );

  const value = useMemo<InvestContextValue>(
    () => ({
      amountUsd,
      amountInput,
      setAmountInput,
      totalUsd6: amountInputToUsd6(amountInput),
      scope,
      setScope,
      destination,
      setDestination,
      baseFundingToken,
      setBaseFundingToken,
      arbitrumFundingToken,
      setArbitrumFundingToken,
      singleChainFundingDraft,
      setSingleChainFundingDraft,
      hyperCoreFundingDraft,
      setHyperCoreFundingDraft,
      hlpBaselineUsd6,
      setHlpBaselineUsd6,
    }),
    [
      amountInput,
      amountUsd,
      arbitrumFundingToken,
      baseFundingToken,
      destination,
      hlpBaselineUsd6,
      hyperCoreFundingDraft,
      scope,
      setAmountInput,
      setArbitrumFundingToken,
      setBaseFundingToken,
      setDestination,
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
  destination?: InvestDestination;
}

/**
 * The Base source batch is identical for every destination; only the split
 * decides where the bridged USDC lands.
 */
function baseInvestRequest(
  userAddress: `0x${string}`,
  draft: Extract<SingleChainFundingDraft, { scope: 'base' }>,
  split: ChainSplit,
): ReviewedDepositRequest {
  return {
    kind: 'invest',
    userAddress,
    fromToken: draft.fromToken,
    fromAmount: draft.fromAmount,
    sourceChainId: draft.chainId,
    split,
  };
}

export function buildInvestDepositPlanRequest({
  userAddress,
  scope,
  totalUsd6,
  baseFundingToken,
  arbitrumFundingToken,
  singleChainFundingDraft,
  destination = 'strategy',
}: InvestDepositPlanRequestParams): ReviewedDepositRequest | null {
  if (destination === 'hlp') {
    if (
      scope !== 'base' ||
      !singleChainFundingDraft ||
      singleChainFundingDraft.scope !== 'base'
    ) {
      return null;
    }
    return baseInvestRequest(userAddress, singleChainFundingDraft, {
      [String(HYPERCORE_CHAIN_ID)]: 1,
    });
  }
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
    return baseInvestRequest(userAddress, singleChainFundingDraft, {
      '8453': 1,
    });
  }
  return {
    kind: 'gmx-v2-basket',
    userAddress,
    fromToken: singleChainFundingDraft.fromToken,
    amount: singleChainFundingDraft.fromAmount,
  };
}

export function buildInvestDepositPlanPreviewKey(
  scope: InvestScope,
  request: ReviewedDepositRequest | null,
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
      JSON.stringify(request.split ?? {}),
    ];
  }
  if (request.kind === 'gmx-v2-basket') {
    return [scope, 42161, request.fromToken, request.amount, request.kind];
  }
  return [scope, 42161, request.fromToken, request.amount, request.marketKey];
}

/**
 * Resolves which execution groups the current scope expects, keyed by the
 * group ids emitted by `/plan-orchestration/deposit/review`.
 */
function reviewGroupKeysFor(
  scope: InvestScope,
  plan: ReviewedDepositPlan | undefined,
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
  plan: ReviewedDepositPlan | undefined;
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
    destination,
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
        destination,
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
