import { useQuery } from '@tanstack/react-query';

import { useWalletProvider } from '@/providers/WalletProvider';
import { transactionServiceMock } from '@/services';

interface UseTokenBalanceQueryOptions {
  enabled?: boolean;
}

export function useTokenBalanceQuery(
  chainId: number | undefined,
  tokenAddress: string | undefined,
  options?: UseTokenBalanceQueryOptions,
) {
  const { account } = useWalletProvider();

  return useQuery<{ balance: string; usdValue: number }>({
    queryKey: [
      'token-balance',
      chainId,
      tokenAddress,
      account?.address ?? 'no-account',
    ],
    queryFn: async () => {
      if (!chainId || !tokenAddress) {
        throw new Error('Missing chain or token for balance lookup');
      }

      return transactionServiceMock.getTokenBalance(chainId, tokenAddress);
    },
    enabled:
      Boolean(chainId && tokenAddress && account?.address) &&
      (options?.enabled ?? true),
    staleTime: 10_000,
  });
}
