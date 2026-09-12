import { useQuery } from '@tanstack/react-query';
import { createQueryConfig } from '@zapengine/app-core/hooks/queries';
import { getPerpUsdcBalance } from '@zapengine/app-core/services';

export interface HlpPerpBalance {
  withdrawableUsd6: bigint;
  accountValueUsd6: bigint;
}

export interface UseHlpPerpBalanceResult {
  balance: HlpPerpBalance | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * HyperCore (Hyperliquid chain) perp USDC balance for the connected wallet —
 * the destination side of the HLP bridge. This never gates the deposit input:
 * the bridge is funded from Base wallet USDC, so a zero HyperCore balance is
 * a valid starting state. Vault equity is intentionally out of scope here;
 * the HLP vault address is server-authoritative and only known after review.
 */
export function useHlpPerpBalance(
  address: string | null,
): UseHlpPerpBalanceResult {
  const enabled = Boolean(address);
  const query = useQuery({
    ...createQueryConfig({ dataType: 'volatile' }),
    queryKey: ['hlp', 'perp-balance', address],
    enabled,
    // The public info API is rate limited — never poll faster than this.
    // This is a display read, so it stays far from the 6s arrival-poll pace.
    staleTime: 60 * 1000,
    queryFn: () => getPerpUsdcBalance({ user: address as `0x${string}` }),
  });

  return {
    balance: query.data,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    refetch: () => query.refetch(),
  };
}
