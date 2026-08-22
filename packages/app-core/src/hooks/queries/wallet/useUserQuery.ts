import {
  isAccountBootstrapSuspended,
  resumeAccountBootstrap,
} from '@core/lib/state/accountBootstrap';
import { queryKeys } from '@core/lib/state/queryClient';
import { useWalletProvider } from '@core/providers/walletContext';
import type { UserProfileResponse } from '@core/schemas/api/accountSchemas';
import {
  connectWallet,
  getUserByWallet,
  getUserProfile,
} from '@core/services/accountService';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { createQueryConfig } from '../queryDefaults';

/**
 * Query key factory for all user-related queries.
 *
 * Use this to build stable query keys and to invalidate user cache slices:
 *
 * @example
 * queryClient.invalidateQueries({ queryKey: userQueryKeys.all });
 * queryClient.invalidateQueries({ queryKey: userQueryKeys.byWallet('0x…') });
 */
export const userQueryKeys = queryKeys.user;

// Removed ApiBundleResponse in favor of account API wallets

export interface UserInfo {
  userId: string;
  email: string;
  isSubscribedToReports: boolean;
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
    isSubscribedToReports: profileData.user?.is_subscribed_to_reports ?? false,
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
export function useUserByWallet(walletAddress: string | null, enabled = true) {
  return useQuery(
    buildUserQuery(
      queryKeys.user.byWallet(walletAddress || ''),
      enabled ? walletAddress : null,
      async () => {
        if (!walletAddress) throw new Error('No wallet address provided');

        const { user_id: userId } = await getUserByWallet(walletAddress);
        const profileData: UserProfileResponse = await getUserProfile(userId);

        return buildUserInfo({
          userId,
          profileData,
          fallbackWallet: walletAddress,
        });
      },
    ),
  );
}

/** Hook to access current user data (combines wallet connection + user query) */
export function useCurrentUser() {
  const { account } = useWalletProvider();
  const connectedWallet = account?.address ?? null;

  // Keep account identity stable for the lifetime of a connected session.
  // The active signer may temporarily change so another wallet can prove
  // ownership before joining this bundle; that must not bootstrap/switch the
  // Zap Pilot account underneath the mutation.
  const [sessionWallet, setSessionWallet] = useState<string | null>(
    connectedWallet,
  );
  const previousSessionWallet = useRef<string | null>(sessionWallet);
  const [bootstrappedWallet, setBootstrappedWallet] = useState<string | null>(
    null,
  );
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);

  useEffect(() => {
    if (!connectedWallet) {
      const previous = previousSessionWallet.current;
      if (previous) {
        resumeAccountBootstrap(previous);
      }
      previousSessionWallet.current = null;
      setSessionWallet(null);
      setBootstrappedWallet(null);
    } else {
      if (previousSessionWallet.current === null) {
        // A genuinely new wallet session may bootstrap again. A wallet that
        // never disconnected after account deletion stays suspended.
        resumeAccountBootstrap(connectedWallet);
      }
      setSessionWallet((current) => {
        const next = current ?? connectedWallet;
        previousSessionWallet.current = next;
        return next;
      });
    }
  }, [connectedWallet]);

  const ensureSessionAccount = useCallback(async () => {
    if (!sessionWallet || isAccountBootstrapSuspended(sessionWallet)) {
      return false;
    }
    setBootstrapError(null);
    try {
      await connectWallet(sessionWallet);
      if (isAccountBootstrapSuspended(sessionWallet)) {
        return false;
      }
      setBootstrappedWallet(sessionWallet);
      return true;
    } catch (error) {
      setBootstrapError(
        error instanceof Error ? error : new Error(String(error)),
      );
      return false;
    }
  }, [sessionWallet]);

  useEffect(() => {
    if (!sessionWallet || bootstrappedWallet === sessionWallet) {
      return;
    }
    void ensureSessionAccount();
  }, [bootstrappedWallet, ensureSessionAccount, sessionWallet]);

  const userQuery = useUserByWallet(
    sessionWallet,
    !!sessionWallet && bootstrappedWallet === sessionWallet,
  );
  const refetch = useCallback(async () => {
    if (bootstrappedWallet !== sessionWallet) {
      const ready = await ensureSessionAccount();
      if (!ready) {
        return;
      }
    }
    return userQuery.refetch();
  }, [bootstrappedWallet, ensureSessionAccount, sessionWallet, userQuery]);

  return {
    ...userQuery,
    refetch,
    isConnected: !!connectedWallet,
    connectedWallet,
    userInfo: userQuery.data || null,
    error:
      bootstrapError?.message ??
      (userQuery.error as Error | null)?.message ??
      null,
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
