import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/state/queryClient';
import { useWalletProvider } from '@/providers/WalletProvider';
import type { UserProfileResponse } from '@/schemas/api/accountSchemas';
import { connectWallet, getUserProfile } from '@/services';

import { createQueryConfig } from '../queryDefaults';

// Removed ApiBundleResponse in favor of account API wallets

export interface UserInfo {
  userId: string;
  email: string;
  bundleWallets: string[];
  additionalWallets: {
    wallet_address: string;
    label: string | null;
    created_at: string;
  }[];
  visibleWallets: string[];
  totalWallets: number;
  totalVisibleWallets: number;
  isNewUser?: boolean;
  etlJobId?: string | null;
}

const baseUserQueryConfig = createQueryConfig({
  retryConfig: {
    skipErrorMessages: ['USER_NOT_FOUND'],
  },
});

interface BuildUserInfoInput {
  userId: string;
  profileData: UserProfileResponse;
  fallbackWallet?: string | null;
  isNewUser?: boolean;
  etlJobId?: string | null;
}

function buildUserInfo({
  userId,
  profileData,
  fallbackWallet,
  isNewUser,
  etlJobId,
}: BuildUserInfoInput): UserInfo {
  const wallets = profileData.wallets || [];
  const userEmail = profileData.user?.email || '';
  let bundleWallets: string[] = [];
  if (wallets.length > 0) {
    bundleWallets = wallets.map((w) => w.wallet);
  } else if (fallbackWallet) {
    bundleWallets = [fallbackWallet];
  }

  const additionalWallets = wallets.map((w) => ({
    wallet_address: w.wallet,
    label: w.label ?? null,
    created_at: w.created_at,
  }));

  return {
    userId,
    email: userEmail,
    bundleWallets,
    additionalWallets,
    visibleWallets: bundleWallets,
    totalWallets: bundleWallets.length,
    totalVisibleWallets: bundleWallets.length,
    ...(isNewUser && { isNewUser }),
    ...(etlJobId && { etlJobId }),
  };
}

/**
 * Builds a React Query config for user data queries.
 *
 * @param key - Query key array
 * @param identifier - Value that must be non-null to enable the query
 * @param fetchUser - Async function returning a UserInfo
 * @returns React Query options
 */
function buildUserQuery(
  key: readonly unknown[],
  identifier: string | null,
  fetchUser: () => Promise<UserInfo>,
) {
  return {
    ...baseUserQueryConfig,
    queryKey: key,
    queryFn: fetchUser,
    enabled: !!identifier,
  };
}

/** Hook to get user by wallet address */
export function useUserByWallet(walletAddress: string | null) {
  return useQuery(
    buildUserQuery(
      queryKeys.user.byWallet(walletAddress || ''),
      walletAddress,
      async () => {
        if (!walletAddress) throw new Error('No wallet address provided');

        const connectResponse = await connectWallet(walletAddress);
        const {
          user_id: userId,
          is_new_user: isNewUser,
          etl_job,
        } = connectResponse;

        const profileData: UserProfileResponse = await getUserProfile(userId);

        return buildUserInfo({
          userId,
          profileData,
          fallbackWallet: walletAddress,
          isNewUser,
          etlJobId: etl_job?.job_id ?? null,
        });
      },
    ),
  );
}

/** Hook to access current user data (combines wallet connection + user query) */
export function useCurrentUser() {
  const { account } = useWalletProvider();
  const connectedWallet = account?.address ?? null;

  const userQuery = useUserByWallet(connectedWallet);

  return {
    ...userQuery,
    isConnected: !!connectedWallet,
    connectedWallet,
    userInfo: userQuery.data || null,
    error: (userQuery.error as Error | null)?.message || null,
  };
}

/**
 * Hook to get user data by userId (for viewing bundle owner's data).
 * Used in visitor mode to see bundle owner's wallets.
 *
 * @param userId - The userId to fetch (bundle owner ID from URL)
 * @returns Query result with user profile data
 */
export function useUserById(userId: string | null) {
  return useQuery(
    buildUserQuery(queryKeys.user.byId(userId || ''), userId, async () => {
      if (!userId) throw new Error('No user ID provided');

      const profileData: UserProfileResponse = await getUserProfile(userId);

      return buildUserInfo({ userId, profileData });
    }),
  );
}
