import { useUser } from '@zapengine/app-core/hooks/queries/wallet/useUser';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import { useCallback, useMemo } from 'react';

import type {
  ConnectOutcome,
  DesktopAccount,
} from '@/integration/accountTypes';
import { resolveViewingState } from '@/integration/bundleViewModel';
import { getBundleViewUserId } from '@/integration/bundleViewParam';
import { isPrivyLoginCancellation } from '@/integration/nativePrivyLogin';

export type {
  ConnectOutcome,
  DesktopAccount,
} from '@/integration/accountTypes';

// A fresh `[]` per render gives every consumer a changed dependency for a
// bundle that did not change, so the empty case has one shared identity.
const EMPTY_WALLET_ADDRESSES: string[] = [];
const EMPTY_WALLET_ENTRIES: DesktopAccount['walletEntries'] = [];

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
  const walletAddresses =
    user.userInfo?.bundleWallets ?? EMPTY_WALLET_ADDRESSES;
  const additionalWallets = user.userInfo?.additionalWallets;
  const walletEntries = useMemo(
    () =>
      additionalWallets?.map((wallet) => ({
        address: wallet.wallet_address,
        label: wallet.label,
      })) ?? EMPTY_WALLET_ENTRIES,
    [additionalWallets],
  );
  const urlUserId = getBundleViewUserId();
  // `userId` stays the real logged-in user; the viewing fields decide whose
  // bundle the screens display (a `?userId=` link overrides, read-only).
  const viewing = useMemo(
    () =>
      resolveViewingState({
        urlUserId,
        ownUserId: userId,
        isConnected,
        loadingUser: user.loading,
        userError: user.error,
      }),
    [isConnected, urlUserId, user.error, user.loading, userId],
  );

  const retryUserResolution = useCallback(() => refetchUser(), [refetchUser]);

  const connect = useCallback(async (): Promise<ConnectOutcome> => {
    if (!isConnected) {
      try {
        await connectWallet();
      } catch (error) {
        // Closing Privy's login UI is a cancellation, not a failure. Real
        // failures keep rejecting; the provider already exposes them through
        // `connectionError` for the screens that render it.
        if (isPrivyLoginCancellation(error)) {
          return 'cancelled';
        }
        throw error;
      }
      return 'connected';
    }

    // A connected wallet already has a live connector. If its account-engine
    // record is missing, retry that query instead of reopening the wallet
    // picker (which would make wagmi throw ConnectorAlreadyConnectedError).
    if (userId === null && urlUserId === null) {
      await retryUserResolution();
    }
    return 'connected';
  }, [connectWallet, isConnected, retryUserResolution, urlUserId, userId]);

  // Deliberately not memoized: `useUser().refetch` gets a new identity on most
  // renders, so a `useMemo` here would advertise a stability this object cannot
  // have. Consumers depend on the individual fields, which are stable.
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
