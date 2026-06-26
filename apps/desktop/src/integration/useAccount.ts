import { useUser } from '@zapengine/app-core/hooks/queries/wallet/useUser';
import { useWalletProvider } from '@zapengine/app-core/providers/WalletProvider';

export interface DesktopAccount {
  /** A wallet/account is connected (Privy embedded wallet present). */
  isConnected: boolean;
  isConnecting: boolean;
  /** Active EOA address, or null when disconnected. */
  address: string | null;
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

  return {
    isConnected: wallet.isConnected,
    isConnecting: wallet.isConnecting,
    address: wallet.account?.address ?? user.connectedWallet ?? null,
    userId: user.userInfo?.userId ?? null,
    email: user.userInfo?.email ?? null,
    loadingUser: user.loading,
    error: wallet.error?.message ?? user.error ?? null,
    connect: wallet.connect,
    disconnect: wallet.disconnect,
  };
}
