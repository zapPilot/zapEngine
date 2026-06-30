import { useUser } from '@zapengine/app-core/hooks/queries/wallet/useUser';
import { useUserById } from '@zapengine/app-core/hooks/queries/wallet/useUserQuery';
import { useWalletProvider } from '@zapengine/app-core/providers/WalletProvider';
import { useLocation } from 'react-router-dom';

import {
  getDesktopUserIdOverrideFromUrl,
  resolveDesktopUserId,
} from '@/integration/legacyBundle';

export interface DesktopAccount {
  /** A wallet/account is connected (Privy embedded wallet present). */
  isConnected: boolean;
  isConnecting: boolean;
  /** Active EOA address, or null when disconnected. */
  address: string | null;
  /** Bundle wallet addresses used for read-only portfolio/activity data. */
  walletAddresses: string[];
  /** Resolved Zap Pilot user id (from account-engine), or null. */
  userId: string | null;
  email: string | null;
  /** Still resolving the backend user record after connect. */
  loadingUser: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Single source of truth for the desktop's connection + identity state, built
 * from app-core's `useWalletProvider` (Privy connection) and `useUser`
 * (account-engine user record). Screens read `userId` to fetch real data and
 * fall back to a connect prompt while it is null.
 */
export function useAccount(): DesktopAccount {
  const wallet = useWalletProvider();
  const user = useUser();
  const location = useLocation();
  const urlUserId = getDesktopUserIdOverrideFromUrl(
    typeof window === 'undefined' ? '' : window.location.search,
    location.search,
    typeof window === 'undefined' ? '' : window.location.hash,
  );
  const userId = resolveDesktopUserId(user.userInfo?.userId ?? null, urlUserId);
  const bundleOwner = useUserById(urlUserId ? userId : null);
  const resolvedUserInfo = bundleOwner.data ?? user.userInfo;
  const walletAddresses = resolvedUserInfo?.bundleWallets ?? [];

  return {
    isConnected: wallet.isConnected,
    isConnecting: wallet.isConnecting,
    address:
      wallet.account?.address ??
      user.connectedWallet ??
      walletAddresses[0] ??
      null,
    walletAddresses,
    userId,
    email: resolvedUserInfo?.email ?? null,
    loadingUser: user.loading || (Boolean(urlUserId) && bundleOwner.isLoading),
    error:
      wallet.error?.message ??
      user.error ??
      ((bundleOwner.error as Error | null)?.message || null),
    connect: wallet.connect,
    disconnect: wallet.disconnect,
  };
}
