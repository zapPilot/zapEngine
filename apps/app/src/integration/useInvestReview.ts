import { useQuery } from '@tanstack/react-query';
import { handleHTTPError } from '@zapengine/app-core/lib/http';
import { getDepositReview } from '@zapengine/app-core/services';
import type {
  DepositReviewGroup,
  ReviewedDepositPlan,
} from '@zapengine/types/api';

import { resolveStageReviewGroup } from '@/integration/investReviewModel';
import {
  stageDraftRequest,
  stageDraftsKey,
  type StageDraft,
} from '@/integration/investTargetsModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';

export interface ReviewedStage {
  draft: StageDraft;
  plan: ReviewedDepositPlan;
  review: DepositReviewGroup;
}

async function reviewStageDraft(
  draft: StageDraft,
  userAddress: `0x${string}`,
): Promise<ReviewedStage> {
  const response = await getDepositReview(
    stageDraftRequest(draft, userAddress),
  );
  const review = resolveStageReviewGroup(response);
  if (!review) {
    throw new Error(
      `The review for ${draft.positionId} did not return one executable batch.`,
    );
  }
  return { draft, plan: response.plan, review };
}

export interface UseInvestReviewResult {
  drafts: readonly StageDraft[];
  stages: ReviewedStage[];
  hasAllStages: boolean;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  retry: () => void;
  refresh: () => Promise<ReviewedStage[]>;
  /** Re-review a single stage, for a checkpoint that must not disturb the rest. */
  reviewStage: (index: number) => Promise<ReviewedStage>;
}

/**
 * Review every frozen stage in parallel. The drafts are already frozen by the
 * amount step, so this never reads live balances — re-deriving amounts here
 * would let a price tick change what the user is about to sign.
 */
export function useInvestReview(
  options: {
    /**
     * Set false on screens that only need `reviewStage` for a checkpoint;
     * mounting them must not re-review every stage against Tenderly again.
     */
    autoReview?: boolean;
  } = {},
): UseInvestReviewResult {
  const { address } = useAccount();
  const { stageDrafts } = useInvest();
  const userAddress = address ? (address as `0x${string}`) : null;
  const draftsKey = stageDraftsKey(stageDrafts);
  const enabled =
    (options.autoReview ?? true) &&
    Boolean(userAddress) &&
    stageDrafts.length > 0;

  const result = useQuery({
    queryKey: ['invest-review', address, draftsKey],
    enabled,
    queryFn: async (): Promise<ReviewedStage[]> => {
      if (!userAddress)
        throw new Error('Connect a wallet to review the route.');
      return Promise.all(
        stageDrafts.map((draft) => reviewStageDraft(draft, userAddress)),
      );
    },
  });

  const stages = result.data ?? [];
  return {
    drafts: stageDrafts,
    stages,
    hasAllStages: enabled && stages.length === stageDrafts.length,
    isLoading: enabled && result.isLoading,
    isError: result.isError,
    errorMessage: result.error ? handleHTTPError(result.error) : null,
    retry: () => void result.refetch(),
    refresh: async () => (await result.refetch()).data ?? [],
    reviewStage: async (index) => {
      const draft = stageDrafts[index];
      if (!draft || !userAddress) {
        throw new Error('The next reviewed batch is unavailable.');
      }
      return reviewStageDraft(draft, userAddress);
    },
  };
}
