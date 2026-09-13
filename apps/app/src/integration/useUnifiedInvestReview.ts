import { getDepositReview } from '@zapengine/app-core/services';
import {
  SUPPORTED_DEPOSIT_CHAINS,
  type DepositReviewGroup,
  type PlanOrchestrationDepositReviewResponse,
  type ReviewedDepositPlan,
} from '@zapengine/types/api';
import { useQuery } from '@tanstack/react-query';

import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import {
  buildHlpBridge2Request,
  buildUnifiedInvestRequests,
  type UnifiedInvestTargetDraft,
  type UnifiedInvestTargetId,
} from '@/integration/unifiedInvestModel';
import { useUnifiedInvest } from '@/integration/useUnifiedInvest';
import { useWalletAssets } from '@/integration/walletTokens';

export interface UnifiedReviewedStage extends UnifiedInvestTargetDraft {
  plan: ReviewedDepositPlan;
  review: DepositReviewGroup;
  response: PlanOrchestrationDepositReviewResponse;
}

function singleReview(
  response: PlanOrchestrationDepositReviewResponse,
): DepositReviewGroup | null {
  const reviews = Object.values(response.reviews);
  return reviews.length === 1 ? (reviews[0] ?? null) : null;
}

function reviewedStage(
  draft: UnifiedInvestTargetDraft,
  response: PlanOrchestrationDepositReviewResponse,
): UnifiedReviewedStage {
  const review = singleReview(response);
  if (!review || !response.plan) {
    throw new Error(`Review for ${draft.label} did not return one executable batch`);
  }
  return { ...draft, response, plan: response.plan, review };
}

function arbitrumBridgeOutputUsd6(plan: ReviewedDepositPlan): string | null {
  if (!('legs' in plan)) return null;
  const bridge = plan.legs.find(
    (leg) =>
      leg.kind === 'bridge' &&
      leg.chainId === SUPPORTED_DEPOSIT_CHAINS.ARBITRUM,
  );
  return bridge?.toAmountMin ?? null;
}

async function reviewDraft(
  draft: UnifiedInvestTargetDraft,
  userAddress: `0x${string}`,
): Promise<UnifiedReviewedStage[]> {
  const response = await getDepositReview(draft.request);
  const first = reviewedStage(draft, response);
  if (draft.id !== 'hlp' || draft.stage !== 'hlp-ingress') {
    return [first];
  }

  const bridgeOutputUsd6 = arbitrumBridgeOutputUsd6(first.plan);
  if (!bridgeOutputUsd6) {
    throw new Error(
      'HLP ingress review did not return an Arbitrum USDC bridge output',
    );
  }
  const bridge2Draft: UnifiedInvestTargetDraft = {
    id: 'hlp',
    stage: 'hlp-bridge2',
    label: 'HLP',
    detail: 'Arbitrum USDC → Hyperliquid',
    allocationBps: draft.allocationBps,
    hlpFunding: draft.hlpFunding,
    request: buildHlpBridge2Request({
      userAddress,
      amountUsd6: bridgeOutputUsd6,
    }),
  };
  const bridge2Response = await getDepositReview(bridge2Draft.request);
  return [first, reviewedStage(bridge2Draft, bridge2Response)];
}

export function useUnifiedInvestReview(): {
  stages: UnifiedReviewedStage[];
  drafts: UnifiedInvestTargetDraft[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  reviewHasAllStages: boolean;
  refresh: () => Promise<UnifiedReviewedStage[]>;
  targetStages: (id: UnifiedInvestTargetId) => UnifiedReviewedStage[];
} {
  const account = useAccount();
  const invest = useInvest();
  const unified = useUnifiedInvest();
  const balances = useWalletAssets(account.address);
  const drafts =
    account.address && invest.totalUsd6 !== '0'
      ? (buildUnifiedInvestRequests({
          userAddress: account.address as `0x${string}`,
          totalUsd6: invest.totalUsd6,
          allocation: unified.allocation,
          baseFundingToken: invest.baseFundingToken,
          arbitrumFundingToken: invest.arbitrumFundingToken,
          rows: balances.chainRows,
        }) ?? [])
      : [];
  const expectedStageCount =
    drafts.length +
    drafts.filter((draft) => draft.stage === 'hlp-ingress').length;
  const draftKey = drafts
    .map((target) => JSON.stringify(target.request))
    .join('|');

  const result = useQuery({
    queryKey: [
      'unified-invest-review',
      account.address,
      JSON.stringify(unified.allocation),
      draftKey,
    ],
    enabled: Boolean(account.address) && drafts.length > 0,
    queryFn: async (): Promise<UnifiedReviewedStage[]> => {
      const userAddress = account.address as `0x${string}`;
      const reviewed = await Promise.all(
        drafts.map((draft) => reviewDraft(draft, userAddress)),
      );
      // Target order is stable (Morpho → GMX → HLP), and HLP ingress is
      // immediately followed by Bridge2. This exact ordering is the execution
      // checkpoint queue shown to the user.
      return reviewed.flat();
    },
  });

  const stages = result.data ?? [];
  return {
    stages,
    drafts,
    isLoading: drafts.length > 0 && result.isLoading,
    isError: result.isError,
    errorMessage:
      result.error instanceof Error
        ? result.error.message
        : result.error
          ? String(result.error)
          : null,
    reviewHasAllStages:
      expectedStageCount > 0 && stages.length === expectedStageCount,
    refresh: async () => (await result.refetch()).data ?? [],
    targetStages: (id) => stages.filter((stage) => stage.id === id),
  };
}