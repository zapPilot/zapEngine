import {
  clearAccountBootstrap,
  ensureAccountBootstrap,
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
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);

  // Latest session identity, readable after awaited boundaries so a stale
  // completion from a superseded session can never publish state.
  const sessionWalletRef = useRef(sessionWallet);

  const publishSessionWallet = useCallback((next: string | null) => {
    if (sessionWalletRef.current === next) {
      return;
    }
    sessionWalletRef.current = next;
    // The ready mirror belongs to exactly one session; reset it on any
    // transition so the next wallet's query cannot enable early.
    setBootstrapReady(false);
    setSessionWallet(next);
  }, []);

  useEffect(() => {
    if (!connectedWallet) {
      const previous = previousSessionWallet.current;
      if (previous) {
        clearAccountBootstrap(previous);
      }
      previousSessionWallet.current = null;
      publishSessionWallet(null);
    } else {
      if (previousSessionWallet.current === null) {
        // A genuinely new wallet session may bootstrap again. A wallet that
        // never disconnected after account deletion stays suspended.
        resumeAccountBootstrap(connectedWallet);
      }
      const next = previousSessionWallet.current ?? connectedWallet;
      previousSessionWallet.current = next;
      publishSessionWallet(next);
    }
  }, [connectedWallet, publishSessionWallet]);

  const ensureSessionAccount = useCallback(async () => {
    const wallet = sessionWalletRef.current;
    if (!wallet) {
      return false;
    }
    setBootstrapError(null);
    try {
      const outcome = await ensureAccountBootstrap(wallet, () =>
        connectWallet(wallet),
      );
      if (sessionWalletRef.current !== wallet) {
        return false;
      }
      setBootstrapReady(outcome === 'ready');
      return outcome === 'ready';
    } catch (error) {
      if (sessionWalletRef.current !== wallet) {
        return false;
      }
      setBootstrapReady(false);
      setBootstrapError(
        error instanceof Error ? error : new Error(String(error)),
      );
      return false;
    }
  }, []);

  useEffect(() => {
    if (!sessionWallet || bootstrapReady) {
      return;
    }
    void ensureSessionAccount();
  }, [bootstrapReady, ensureSessionAccount, sessionWallet]);

  const userQuery = useUserByWallet(
    sessionWallet,
    !!sessionWallet && bootstrapReady,
  );
  const refetch = useCallback(async () => {
    if (!sessionWallet || bootstrapReady) {
      return userQuery.refetch();
    }
    const ready = await ensureSessionAccount();
    if (!ready) {
      return;
    }
    return userQuery.refetch();
  }, [bootstrapReady, ensureSessionAccount, sessionWallet, userQuery]);

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
