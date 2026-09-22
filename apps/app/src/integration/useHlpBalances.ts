import { useQuery } from '@tanstack/react-query';
import { createQueryConfig } from '@zapengine/app-core/hooks/queries/queryDefaults';
import {
  getHyperCoreSpendableUsdc,
  type HyperCoreSpendableUsdc,
} from '@zapengine/app-core/services/hyperliquidService';

export interface HlpBalanceResult<T> {
  balance: T | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * One authoritative HLP balance snapshot. The service resolves whether this
 * account is Unified or Standard and exposes the correct spendable pocket.
 */
export function useHyperCoreSpendable(
  address: string | null,
): HlpBalanceResult<HyperCoreSpendableUsdc> {
  const enabled = Boolean(address);
  const query = useQuery({
    ...createQueryConfig({ dataType: 'volatile' }),
    queryKey: ['hlp', 'spendable', address],
    enabled,
    staleTime: 60 * 1000,
    queryFn: () =>
      getHyperCoreSpendableUsdc({ user: address as `0x${string}` }),
  });

  return {
    balance: query.data,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    refetch: () => query.refetch(),
  };
}
