import { queryKeys } from '@core/lib/state/queryClient';
import type { UserCryptoWallet } from '@core/schemas/api/accountSchemas';
import { getUserWallets } from '@core/services/accountService';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { createQueryConfig } from '../queryDefaults';

/**
 * Fetch a user's bundle wallets by userId via account-engine
 * `GET /users/:userId/wallets`.
 *
 * This public endpoint returns wallet rows only. Reuses
 * `queryKeys.user.wallets(userId)`, the same key the
 * wallet mutations invalidate, so add/remove-wallet stays cache-coherent.
 */
export function useUserWallets(
  userId: string | null,
): UseQueryResult<UserCryptoWallet[], unknown> {
  return useQuery({
    ...createQueryConfig(),
    queryKey: queryKeys.user.wallets(userId ?? ''),
    queryFn: () => {
      if (!userId) throw new Error('No user ID provided');
      return getUserWallets(userId);
    },
    enabled: !!userId,
  });
}
