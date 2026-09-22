import { useQuery } from '@tanstack/react-query';
import { handleHTTPError } from '@zapengine/app-core/lib/http';
import { getDepositReview } from '@zapengine/app-core/services/planOrchestrationService';
import type {
  DepositReviewGroup,
  ReviewedDepositPlan,
} from '@zapengine/types/api';

import { resolveStageReviewGroup } from '@/integration/investReviewModel';
import {
  chainBatchDrafts,
  chainBatchRequest,
  stageDraftsKey,
  type ChainBatchDraft,
  type StageDraft,
} from '@/integration/investTargetsModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';

export interface ReviewedBatch {
  /** The frozen positions this one wallet batch funds, in execution order. */
  draft: ChainBatchDraft;
  plan: ReviewedDepositPlan;
  review: DepositReviewGroup;
}

async function reviewChainBatch(
  batch: ChainBatchDraft,
  userAddress: `0x${string}`,
): Promise<ReviewedBatch> {
  const response = await getDepositReview(
    chainBatchRequest(batch, userAddress),
  );
  const review = resolveStageReviewGroup(response);
  if (!review) {
    throw new Error(
      `The review for chain ${batch.chainId} did not return one executable batch.`,
    );
  }
  return { draft: batch, plan: response.plan, review };
}

export interface UseInvestReviewResult {
  drafts: readonly StageDraft[];
  batches: ReviewedBatch[];
  hasAllBatches: boolean;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  retry: () => void;
  refresh: () => Promise<ReviewedBatch[]>;
  /** Re-review a single batch, for a checkpoint that must not disturb the rest. */
  reviewBatch: (index: number) => Promise<ReviewedBatch>;
}

/**
 * Review every frozen source chain in parallel. The drafts are already frozen
 * by the amount step, so this never reads live balances — re-deriving amounts
 * here would let a price tick change what the user is about to sign.
 */
export function useInvestReview(
  options: {
    /**
     * Set false on screens that only need `reviewBatch` for a checkpoint;
     * mounting them must not re-review every batch against Tenderly again.
     */
    autoReview?: boolean;
  } = {},
): UseInvestReviewResult {
  const { address } = useAccount();
  const { stageDrafts } = useInvest();
  const userAddress = address ? (address as `0x${string}`) : null;
  const draftsKey = stageDraftsKey(stageDrafts);
  const drafted = chainBatchDrafts(stageDrafts);
  const enabled =
    (options.autoReview ?? true) && Boolean(userAddress) && drafted.length > 0;

  const result = useQuery({
    queryKey: ['invest-review', address, draftsKey],
    enabled,
    queryFn: async (): Promise<ReviewedBatch[]> => {
      if (!userAddress)
        throw new Error('Connect a wallet to review the route.');
      return Promise.all(
        chainBatchDrafts(stageDrafts).map((batch) =>
          reviewChainBatch(batch, userAddress),
        ),
      );
    },
  });

  const batches = result.data ?? [];
  return {
    drafts: stageDrafts,
    batches,
    hasAllBatches: enabled && batches.length === drafted.length,
    isLoading: enabled && result.isLoading,
    isError: result.isError,
    errorMessage: result.error ? handleHTTPError(result.error) : null,
    retry: () => void result.refetch(),
    refresh: async () => (await result.refetch()).data ?? [],
    reviewBatch: async (index) => {
      const batch = chainBatchDrafts(stageDrafts)[index];
      if (!batch || !userAddress) {
        throw new Error('The next reviewed batch is unavailable.');
      }
      return reviewChainBatch(batch, userAddress);
    },
  };
}
