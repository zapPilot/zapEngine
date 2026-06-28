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

interface DepositPlanPreview {
  plan: DepositPlan | undefined;
  isLoading: boolean;
  isError: boolean;
}

/**
 * React Query wrapper around `getDepositPlan` for the invest route-preview
 * screen. Stays disabled until a wallet is connected and a positive amount is
 * entered, so it never fires a plan request for an empty draft.
 */
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
    queryFn: () =>
      getDepositPlan({
        kind: 'invest',
        userAddress: address as `0x${string}`,
        fromToken,
        fromAmount,
        sourceChainId,
      }),
  });

  return {
    plan: query.data,
    // `isLoading` is `pending && fetching`; gate on `enabled` so a disabled
    // (no wallet / zero amount) query reads as idle, not loading.
    isLoading: enabled && query.isLoading,
    isError: query.isError,
  };
}
