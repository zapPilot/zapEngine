import { queryKeys } from '@core/lib/state/queryClient';
import type { UserCryptoWallet } from '@core/schemas/api/accountSchemas';
import { getUserWallets } from '@core/services';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { createQueryConfig } from '../queryDefaults';

/**
 * Fetch a user's bundle wallets by userId via account-engine
 * `GET /users/:userId/wallets`.
 *
 * Visitor-mode safe: this endpoint returns wallet rows only, never the user's
 * email. Do NOT swap in `getUserProfile` / `useUserById` here — those return
 * the bundle owner's email, which would leak to anyone opening a shared
 * `?userId=` link. Reuses `queryKeys.user.wallets(userId)`, the same key the
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
