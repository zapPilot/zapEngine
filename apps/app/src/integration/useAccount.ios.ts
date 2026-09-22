import { usePrivy } from '@privy-io/expo';
import { useLogin } from '@privy-io/expo/ui';
import {
  getUserByWallet,
  getUserProfile,
} from '@zapengine/app-core/services/accountService';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  readIosWatchPortfolioAddress,
  subscribeIosWatchPortfolioAddress,
} from '@/integration/iosWatchPortfolioAddress';
import {
  isPrivyLoginCancellation,
  loginWithPrivy,
} from '@/integration/nativePrivyLogin';
import type {
  ConnectOutcome,
  DesktopAccount,
} from '@/integration/accountTypes';
import { isLinkedAccountRecord } from '@/integration/privyLinkedAccounts';

export function getPrivyEmbeddedEthereumAddress(
  linkedAccounts: readonly unknown[] | null | undefined,
): string | null {
  for (const account of linkedAccounts ?? []) {
    if (!isLinkedAccountRecord(account)) continue;
    const isWallet =
      account.type === 'wallet' || account.connector_type === 'embedded';
    if (
      !isWallet ||
      account.connector_type !== 'embedded' ||
      account.chain_type !== 'ethereum' ||
      typeof account.address !== 'string'
    ) {
      continue;
    }
    const address = account.address.trim();
    if (address) return address.toLowerCase();
  }
  return null;
}

type Profile = Awaited<ReturnType<typeof getUserProfile>>;

export function useAccount(): DesktopAccount {
  const { isReady, user, logout } = usePrivy();
  const { login } = useLogin();
  const [watchAddress, setWatchAddress] = useState<string | null>(null);
  const [watchHydrated, setWatchHydrated] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [userResolutionError, setUserResolutionError] = useState<string | null>(
    null,
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const resolutionId = useRef(0);

  const privyAddress = getPrivyEmbeddedEthereumAddress(user?.linked_accounts);
  const address = privyAddress ?? watchAddress;
  const subjectSource = privyAddress ? 'privy' : watchAddress ? 'watch' : null;

  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeIosWatchPortfolioAddress((nextAddress) => {
      if (active) setWatchAddress(nextAddress);
    });
    void readIosWatchPortfolioAddress()
      .then((storedAddress) => {
        if (active) setWatchAddress(storedAddress);
      })
      .finally(() => {
        if (active) setWatchHydrated(true);
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const resolveSubject = useCallback(async (subjectAddress: string | null) => {
    // Keep effect-triggered state publication beyond an async boundary. React
    // 19's set-state-in-effect rule rejects helpers that synchronously publish
    // state before their first await, even when the helper itself is async.
    await Promise.resolve();
    const currentResolution = ++resolutionId.current;
    if (!subjectAddress) {
      setProfile(null);
      setUserId(null);
      setUserResolutionError(null);
      setLoadingUser(false);
      return;
    }

    setLoadingUser(true);
    setUserResolutionError(null);
    try {
      const lookup = await getUserByWallet(subjectAddress);
      const nextProfile = await getUserProfile(lookup.user_id);
      if (resolutionId.current !== currentResolution) return;
      setUserId(lookup.user_id);
      setProfile(nextProfile);
    } catch (error) {
      if (resolutionId.current !== currentResolution) return;
      setUserId(null);
      setProfile(null);
      setUserResolutionError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      if (resolutionId.current === currentResolution) {
        setLoadingUser(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!watchHydrated && !privyAddress) return;

    let active = true;
    void Promise.resolve().then(() => {
      if (active) {
        void resolveSubject(address);
      }
    });

    return () => {
      active = false;
    };
  }, [address, privyAddress, resolveSubject, watchHydrated]);

  const connect = useCallback(async (): Promise<ConnectOutcome> => {
    if (privyAddress) return 'connected';
    setConnectionError(null);
    setIsConnecting(true);
    try {
      await loginWithPrivy(login);
      return 'connected';
    } catch (error) {
      if (isPrivyLoginCancellation(error)) return 'cancelled';
      setConnectionError(
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [login, privyAddress]);

  const retryUserResolution = useCallback(
    () => resolveSubject(address),
    [address, resolveSubject],
  );

  const disconnect = useCallback(async () => {
    await logout();
  }, [logout]);

  const walletEntries = useMemo(
    () =>
      profile?.wallets.map((wallet) => ({
        address: wallet.wallet,
        label: wallet.label ?? null,
      })) ?? [],
    [profile?.wallets],
  );
  const walletAddresses = useMemo(
    () => walletEntries.map((wallet) => wallet.address),
    [walletEntries],
  );

  const isResolvingViewingUser =
    Boolean(address) && (loadingUser || (!watchHydrated && !privyAddress));
  const isUserResolutionFailed =
    Boolean(address) && !loadingUser && Boolean(userResolutionError);
  const isDemo = !userId && !isResolvingViewingUser && !isUserResolutionFailed;

  return {
    isConnected: Boolean(privyAddress),
    isConnecting: isConnecting || (!isReady && !user),
    address,
    walletAddresses,
    walletEntries,
    userId,
    etlJobId: null,
    isNewUser: false,
    viewingUserId: userId,
    isOwnBundle: subjectSource === 'privy',
    isResolvingViewingUser,
    isUserResolutionFailed,
    isDemo,
    email: profile?.user.email ?? null,
    loadingUser,
    connectionError,
    userResolutionError,
    connect,
    retryUserResolution,
    disconnect,
  };
}
