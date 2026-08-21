import { useQuery } from '@tanstack/react-query';
import { getDepositPlan } from '@zapengine/app-core/services';
import type { ChainSplit, DepositPlan } from '@zapengine/types/api';

interface DepositPlanPreviewInput {
  address: string | null;
  fromToken: `0x${string}`;
  fromAmount: string;
  sourceChainId: number;
  amountUsd: number;
  /** Destination weights; must match what the execution path will request. */
  split?: ChainSplit;
}

export interface DepositPlanPreview {
  plan: DepositPlan | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function useDepositPlanPreview({
  address,
  fromToken,
  fromAmount,
  sourceChainId,
  amountUsd,
  split,
}: DepositPlanPreviewInput): DepositPlanPreview {
  const enabled = Boolean(address && amountUsd > 0 && fromAmount !== '0');
  const query = useQuery({
    queryKey: [
      'deposit-plan-preview',
      address,
      fromToken,
      fromAmount,
      sourceChainId,
      split ?? null,
    ],
    enabled,
    queryFn: () => {
      const userAddress = address as `0x${string}`;
      return getDepositPlan({
        kind: 'invest',
        userAddress,
        fromToken,
        fromAmount,
        sourceChainId,
        ...(split ? { split } : {}),
      });
    },
  });

  return {
    plan: query.data,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
  };
}
