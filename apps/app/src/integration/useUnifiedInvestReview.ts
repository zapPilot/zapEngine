import { getDepositReview } from '@zapengine/app-core/services';
import type {
  DepositReviewGroup,
  PlanOrchestrationDepositReviewResponse,
  ReviewedDepositPlan,
} from '@zapengine/types/api';
import { useQuery } from '@tanstack/react-query';

import { balanceForFundingToken } from '@/integration/investAmountModel';
import { useAccount } from '@/integration/useAccount';
import { useInvest } from '@/integration/useInvest';
import {
  buildUnifiedInvestRequests,
  type UnifiedInvestTargetDraft,
  type UnifiedInvestTargetId,
} from '@/integration/unifiedInvestModel';
import { useWalletAssets } from '@/integration/walletTokens';

export interface UnifiedReviewedTarget extends UnifiedInvestTargetDraft {
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

export function useUnifiedInvestReview(): {
  targets: UnifiedReviewedTarget[];
  drafts: UnifiedInvestTargetDraft[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  reviewHasAllTargets: boolean;
  refresh: () => Promise<UnifiedReviewedTarget[]>;
  targetById: (id: UnifiedInvestTargetId) => UnifiedReviewedTarget | undefined;
} {
  const account = useAccount();
  const invest = useInvest();
  const balances = useWalletAssets(account.address);
  const baseBalance = balanceForFundingToken(
    balances.chainRows,
    invest.baseFundingToken,
  );
  const arbitrumBalance = balanceForFundingToken(
    balances.chainRows,
    invest.arbitrumFundingToken,
  );
  const drafts =
    account.address && invest.totalUsd6 !== '0'
      ? (buildUnifiedInvestRequests({
          userAddress: account.address as `0x${string}`,
          totalUsd6: invest.totalUsd6,
          baseFundingToken: invest.baseFundingToken,
          baseUsdPrice: baseBalance?.usdPrice ?? null,
          arbitrumFundingToken: invest.arbitrumFundingToken,
          arbitrumUsdPrice: arbitrumBalance?.usdPrice ?? null,
        }) ?? [])
      : [];

  const draftKey = drafts
    .map((target) => JSON.stringify(target.request))
    .join('|');
  const result = useQuery({
    queryKey: ['unified-invest-review', account.address, draftKey],
    enabled: drafts.length === 3,
    queryFn: async () =>
      Promise.all(
        drafts.map(async (draft) => ({
          draft,
          response: await getDepositReview(draft.request),
        })),
      ),
  });

  const targets: UnifiedReviewedTarget[] = (result.data ?? []).flatMap(
    ({ draft, response }) => {
      const review = singleReview(response);
      if (!review || !response.plan) return [];
      return [{ ...draft, response, plan: response.plan, review }];
    },
  );

  const normalize = (
    rows:
      | Array<{
          draft: UnifiedInvestTargetDraft;
          response: PlanOrchestrationDepositReviewResponse;
        }>
      | undefined,
  ): UnifiedReviewedTarget[] =>
    (rows ?? []).flatMap(({ draft, response }) => {
      const review = singleReview(response);
      if (!review || !response.plan) return [];
      return [{ ...draft, response, plan: response.plan, review }];
    });

  return {
    targets,
    drafts,
    isLoading: drafts.length === 3 && result.isLoading,
    isError: result.isError,
    errorMessage:
      result.error instanceof Error ? result.error.message : result.error ? String(result.error) : null,
    reviewHasAllTargets: targets.length === 3,
    refresh: async () => normalize((await result.refetch()).data),
    targetById: (id) => targets.find((target) => target.id === id),
  };
}
