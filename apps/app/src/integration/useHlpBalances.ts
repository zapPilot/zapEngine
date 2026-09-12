import { useQuery } from '@tanstack/react-query';
import { createQueryConfig } from '@zapengine/app-core/hooks/queries';
import {
  getPerpUsdcBalance,
  getSpotUsdcBalance,
  type PerpUsdcBalance,
  type SpotUsdcBalance,
} from '@zapengine/app-core/services';

export interface HlpBalanceResult<T> {
  balance: T | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * Both HyperCore pots are read through identical react-query plumbing, so the
 * shared body is what keeps the two hooks below from being flagged as clones.
 * They stay separate queries so a failing spot read still leaves perp visible.
 */
function useHlpBalanceQuery<T>(
  address: string | null,
  key: string,
  read: (user: `0x${string}`) => Promise<T>,
): HlpBalanceResult<T> {
  const enabled = Boolean(address);
  const query = useQuery({
    ...createQueryConfig({ dataType: 'volatile' }),
    queryKey: ['hlp', key, address],
    enabled,
    // The public info API is rate limited — never poll faster than this.
    // These are display reads, so they stay far from the 6s arrival-poll pace.
    staleTime: 60 * 1000,
    queryFn: () => read(address as `0x${string}`),
  });

  return {
    balance: query.data,
    isLoading: enabled && query.isLoading,
    isError: query.isError,
    refetch: () => query.refetch(),
  };
}

/**
 * Spot USDC on HyperCore — the balance Hyperliquid's own UI reports under
 * Spot, and the one users compare against. Display only: the bridge credits
 * perp, so spot never gates the deposit input.
 */
export function useHlpSpotBalance(
  address: string | null,
): HlpBalanceResult<SpotUsdcBalance> {
  return useHlpBalanceQuery(address, 'spot-balance', (user) =>
    getSpotUsdcBalance({ user }),
  );
}

/**
 * HyperCore perp USDC — the destination side of the HLP bridge and the pot
 * `vaultTransfer` actually debits. This never gates the deposit input either:
 * the bridge is funded from Base wallet USDC, so a zero perp balance is a
 * valid starting state.
 */
export function useHlpPerpBalance(
  address: string | null,
): HlpBalanceResult<PerpUsdcBalance> {
  return useHlpBalanceQuery(address, 'perp-balance', (user) =>
    getPerpUsdcBalance({ user }),
  );
}
