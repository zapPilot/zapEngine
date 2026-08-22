import { useUser } from '@zapengine/app-core/hooks/queries/wallet/useUser';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import { useCallback } from 'react';

import { resolveViewingState } from '@/integration/bundleViewModel';
import { getBundleViewUserId } from '@/integration/bundleViewParam';

export interface DesktopAccount {
  /** A wallet/account is connected (Privy embedded wallet present). */
  isConnected: boolean;
  isConnecting: boolean;
  /** Active EOA address, or null when disconnected. */
  address: string | null;
  /** Bundle wallet addresses used for read-only portfolio/activity data. */
  walletAddresses: string[];
  /** Bundle wallets with user-defined labels for portfolio-level attribution. */
  walletEntries: { address: string; label: string | null }[];
  /** Resolved Zap Pilot user id (from account-engine), or null. */
  userId: string | null;
  /** First-login ETL job returned by account-engine, if one was scheduled. */
  etlJobId: string | null;
  /** Whether account-engine created this user during the current connection. */
  isNewUser: boolean;
  /** User id whose bundle the screens display: URL `?userId=` or `userId`. */
  viewingUserId: string | null;
  /** False when viewing someone else's bundle — hide write affordances. */
  isOwnBundle: boolean;
  /** Connected and waiting on account-engine before `viewingUserId` settles. */
  isResolvingViewingUser: boolean;
  /** Connected wallet whose account-engine user record failed to load. */
  isUserResolutionFailed: boolean;
  /** No live subject to display — screens render DEMO data. */
  isDemo: boolean;
  email: string | null;
  /** Still resolving the backend user record after connect. */
  loadingUser: boolean;
  /** Error raised while connecting the wallet itself. */
  connectionError: string | null;
  /** Error raised while loading the connected wallet's account record. */
  userResolutionError: string | null;
  connect: () => Promise<void>;
  retryUserResolution: () => Promise<unknown>;
  disconnect: () => Promise<void>;
}

/**
 * Single source of truth for the app's connection + identity state, built
 * from app-core's `useWalletProvider` (Privy connection) and `useUser`
 * (account-engine user record). Screens read `userId` to fetch real data and
 * fall back to a connect prompt while it is null.
 */
export function useAccount(): DesktopAccount {
  const wallet = useWalletProvider();
  const user = useUser();
  const refetchUser = user.refetch;
  const {
    account,
    connect: connectWallet,
    disconnect,
    error: walletError,
    isConnected,
    isConnecting,
  } = wallet;
  const userId = user.userInfo?.userId?.trim() || null;
  const walletAddresses = user.userInfo?.bundleWallets ?? [];
  const walletEntries =
    user.userInfo?.additionalWallets?.map((wallet) => ({
      address: wallet.wallet_address,
      label: wallet.label,
    })) ?? [];
  const urlUserId = getBundleViewUserId();
  // `userId` stays the real logged-in user; the viewing fields decide whose
  // bundle the screens display (a `?userId=` link overrides, read-only).
  const viewing = resolveViewingState({
    urlUserId,
    ownUserId: userId,
    isConnected,
    loadingUser: user.loading,
    userError: user.error,
  });

  const retryUserResolution = useCallback(() => refetchUser(), [refetchUser]);

  const connect = useCallback(async (): Promise<void> => {
    if (!isConnected) {
      await connectWallet();
      return;
    }

    // A connected wallet already has a live connector. If its account-engine
    // record is missing, retry that query instead of reopening the wallet
    // picker (which would make wagmi throw ConnectorAlreadyConnectedError).
    if (userId === null && urlUserId === null) {
      await retryUserResolution();
    }
  }, [connectWallet, isConnected, retryUserResolution, urlUserId, userId]);

  return {
    isConnected,
    isConnecting,
    // Only the active signing EOA can fund an execution. Bundle wallets stay
    // available separately for read-only portfolio and activity aggregation.
    address: account?.address ?? user.connectedWallet ?? null,
    walletAddresses,
    walletEntries,
    userId,
    etlJobId: user.userInfo?.etlJobId ?? null,
    isNewUser: user.userInfo?.isNewUser ?? false,
    ...viewing,
    email: user.userInfo?.email ?? null,
    loadingUser: user.loading,
    connectionError: walletError?.message ?? null,
    userResolutionError: user.error,
    connect,
    retryUserResolution,
    disconnect,
  };
}
