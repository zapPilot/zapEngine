import { useQueries, type UseQueryResult } from '@tanstack/react-query';

import { useWalletProvider } from '@/providers/WalletProvider';
import { getOnChainTokenBalance, type OnChainTokenBalance } from '@/services';
import type { TransactionToken } from '@/types/domain/transaction';

export type TokenBalanceQuery = UseQueryResult<OnChainTokenBalance, Error>;

export interface UseTokenBalancesResult {
  /** Per-token balance query, keyed by token address. */
  byAddress: Map<string, TokenBalanceQuery>;
  /** Whether a wallet address is available (else balances are gated off). */
  isConnected: boolean;
}

/**
 * Fetch real on-chain balances + USD valuation for a whole token list in
 * parallel (one query per token).
 *
 * Mirrors `useTokenBalanceQuery` conventions (10s staleTime,
 * address-scoped query key, wallet via `useWalletProvider`) but covers
 * every selector row at once so each token can show its balance like
 * other DeFi protocols — `useTokenBalanceQuery` only resolves the single
 * selected token.
 */
export function useTokenBalances(
  chainId: number | undefined,
  tokens: TransactionToken[],
): UseTokenBalancesResult {
  const { account } = useWalletProvider();
  const address = account?.address;

  const results = useQueries({
    queries: tokens.map((token) => ({
      queryKey: [
        'onchain-token-balance',
        chainId,
        token.address,
        address ?? 'no-account',
      ],
      queryFn: () => {
        /* v8 ignore next 3 -- @preserve: the `enabled` gate guarantees chainId + address are set */
        if (!chainId || !address) {
          throw new Error('Missing chain or wallet for balance lookup');
        }
        return getOnChainTokenBalance(
          chainId,
          token.address,
          token.decimals,
          address,
        );
      },
      enabled: Boolean(chainId && address && token.address),
      staleTime: 10_000,
    })),
  });

  const byAddress = new Map<string, TokenBalanceQuery>();
  for (const [index, result] of results.entries()) {
    const token = tokens[index];
    /* v8 ignore next -- @preserve: results always aligns 1:1 with tokens */
    if (token) {
      byAddress.set(token.address, result);
    }
  }

  return { byAddress, isConnected: Boolean(address) };
}
