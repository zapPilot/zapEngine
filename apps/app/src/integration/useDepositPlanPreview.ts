import { useQuery } from '@tanstack/react-query';
import {
  getDepositPlan,
  getGmxDepositPlan,
} from '@zapengine/app-core/services';
import type { DepositPlan } from '@zapengine/types/api';

import {
  type DesktopDepositPath,
  isGmxDepositPath,
} from '@/integration/depositPaths';

interface DepositPlanPreviewInput {
  address: string | null;
  fromToken: `0x${string}`;
  fromAmount: string;
  sourceChainId: number;
  amountUsd: number;
  depositPath: DesktopDepositPath;
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
  depositPath,
}: DepositPlanPreviewInput): DepositPlanPreview {
  const enabled = Boolean(address && amountUsd > 0 && fromAmount !== '0');
  const query = useQuery({
    queryKey: [
      'deposit-plan-preview',
      address,
      fromToken,
      fromAmount,
      sourceChainId,
      depositPath.id,
    ],
    enabled,
    queryFn: () => {
      const userAddress = address as `0x${string}`;
      if (isGmxDepositPath(depositPath)) {
        return getGmxDepositPlan({
          kind: 'gmx-v2',
          userAddress,
          marketKey: depositPath.marketKey,
          amount: fromAmount,
        });
      }
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
