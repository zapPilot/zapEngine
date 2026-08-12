import { useQuery } from '@tanstack/react-query';
import { getDepositPlan } from '@zapengine/app-core/services';
import type { DepositPlan } from '@zapengine/types/api';

interface DepositPlanPreviewInput {
  address: string | null;
  fromToken: `0x${string}`;
  fromAmount: string;
  sourceChainId: number;
  amountUsd: number;
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
}: DepositPlanPreviewInput): DepositPlanPreview {
  const enabled = Boolean(address && amountUsd > 0 && fromAmount !== '0');
  const query = useQuery({
    queryKey: [
      'deposit-plan-preview',
      address,
      fromToken,
      fromAmount,
      sourceChainId,
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
      });
    },
  });

  return {
    plan: query.data,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
  };
}
