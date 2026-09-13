import { getDepositReview } from '@zapengine/app-core/services';
import type {
  DepositReviewGroup,
  PlanOrchestrationDepositReviewResponse,
  ReviewedDepositPlan,
} from '@zapengine/types/api';
import { useQuery } from '@tanstack/react-query';

import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import {
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

export function singleUnifiedReview(
  response: PlanOrchestrationDepositReviewResponse,
): DepositReviewGroup | null {
  const reviews = Object.values(response.reviews);
  return reviews.length === 1 ? (reviews[0] ?? null) : null;
}

function reviewedStage(
  draft: UnifiedInvestTargetDraft,
  response: PlanOrchestrationDepositReviewResponse,
): UnifiedReviewedStage {
  const review = singleUnifiedReview(response);
  if (!review || !response.plan) {
    throw new Error(
      `Review for ${draft.label} did not return one executable batch`,
    );
  }
  return { ...draft, response, plan: response.plan, review };
}

/**
 * Review only batches that can execute against the wallet's current state.
 *
 * An HLP ingress from Base/Ethereum intentionally stops at Arbitrum here. The
 * subsequent Bridge2 transfer is reviewed after LI.FI reports destination
 * confirmation, otherwise Tenderly would simulate spending USDC that has not
 * reached Arbitrum yet.
 */
async function reviewDraft(
  draft: UnifiedInvestTargetDraft,
): Promise<UnifiedReviewedStage> {
  return reviewedStage(draft, await getDepositReview(draft.request));
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
    queryFn: async (): Promise<UnifiedReviewedStage[]> =>
      Promise.all(drafts.map(reviewDraft)),
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
    reviewHasAllStages: drafts.length > 0 && stages.length === drafts.length,
    refresh: async () => (await result.refetch()).data ?? [],
    targetStages: (id) => stages.filter((stage) => stage.id === id),
  };
}
