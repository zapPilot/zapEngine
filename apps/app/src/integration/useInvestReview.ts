import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { APIError, handleHTTPError } from '@zapengine/app-core/lib/http';
import { getDepositReview } from '@zapengine/app-core/services/planOrchestrationService';
import {
  GMX_DEPOSIT_TOO_SMALL_ERROR_CODE,
  HLP_DEPOSIT_TOO_SMALL_ERROR_CODE,
  HLP_MIN_DEPOSIT_USD6,
  type DepositReviewGroup,
  type ReviewedDepositPlan,
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
import { formatUsd6 } from '@/lib/format';

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

/** A review refusal that only a different amount can fix. */
export interface AmountTooSmall {
  title: string;
  message: string;
}

const GMX_DEPOSIT_TOO_SMALL: AmountTooSmall = {
  title: 'Crypto share too small',
  message:
    'At this amount your Crypto share is too small for GMX: swapping it into the BTC and ETH pools would leave no slippage buffer. Increase the amount or the Crypto percentage.',
};

const HLP_DEPOSIT_TOO_SMALL: AmountTooSmall = {
  title: 'HLP share too small',
  message: `After bridge fees your HLP share would reach Hyperliquid below its ${formatUsd6(HLP_MIN_DEPOSIT_USD6)} minimum. Increase the amount or the Stable percentage.`,
};

function amountTooSmallFor(error: unknown): AmountTooSmall | null {
  if (!(error instanceof APIError)) return null;
  switch (error.code) {
    case GMX_DEPOSIT_TOO_SMALL_ERROR_CODE:
      return GMX_DEPOSIT_TOO_SMALL;
    case HLP_DEPOSIT_TOO_SMALL_ERROR_CODE:
      return HLP_DEPOSIT_TOO_SMALL;
    default:
      return null;
  }
}

/**
 * Re-reviewing the same frozen amounts cannot make a leg bigger, so a
 * too-small refusal surfaces at once; every other failure keeps the client's
 * own retry policy (query-core falls back to 3 when none is configured).
 */
function reviewRetry(
  client: QueryClient,
): (failureCount: number, error: Error) => boolean {
  const fallback = client.getDefaultOptions().queries?.retry ?? 3;
  return (failureCount, error) => {
    if (amountTooSmallFor(error)) return false;
    if (typeof fallback === 'function') return fallback(failureCount, error);
    return typeof fallback === 'number' ? failureCount < fallback : fallback;
  };
}

export interface UseInvestReviewResult {
  drafts: readonly StageDraft[];
  batches: ReviewedBatch[];
  hasAllBatches: boolean;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  /** The review refused a leg as too small: the fix is a bigger share. */
  amountTooSmall: AmountTooSmall | null;
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
  const queryClient = useQueryClient();
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
    retry: reviewRetry(queryClient),
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
  const amountTooSmall = amountTooSmallFor(result.error);
  return {
    drafts: stageDrafts,
    batches,
    hasAllBatches: enabled && batches.length === drafted.length,
    isLoading: enabled && result.isLoading,
    isError: result.isError,
    errorMessage: amountTooSmall
      ? amountTooSmall.message
      : result.error
        ? handleHTTPError(result.error)
        : null,
    amountTooSmall,
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
