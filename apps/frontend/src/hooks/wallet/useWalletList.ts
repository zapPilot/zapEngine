import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";

import { loadWallets as fetchWallets } from "@/components/WalletManager/services/WalletService";
import { TIMINGS } from "@/constants/timings";
import type { WalletData } from "@/lib/validation/walletUtils";

interface ConnectedWallet {
  address: string;
  isActive: boolean;
}

interface UseWalletListParams {
  userId: string | null | undefined;
  connectedWallets: ConnectedWallet[];
  isOpen: boolean;
  isOwner: boolean;
}

interface UseWalletListReturn {
  wallets: WalletData[];
  setWallets: Dispatch<SetStateAction<WalletData[]>>;
  isRefreshing: boolean;
  loadWallets: (silent?: boolean) => Promise<void>;
}

function isWalletActive(
  connectedWallets: ConnectedWallet[],
  walletAddress: string
): boolean {
  return connectedWallets.some(
    connectedWallet =>
      connectedWallet.address.toLowerCase() === walletAddress.toLowerCase() &&
      connectedWallet.isActive
  );
}

function mapWalletsWithActiveState(
  loadedWallets: WalletData[],
  connectedWallets: ConnectedWallet[]
): WalletData[] {
  return loadedWallets.map(wallet => ({
    ...wallet,
    isActive: isWalletActive(connectedWallets, wallet.address),
  }));
}

/**
 * Hook for managing wallet list loading and periodic refresh
 *
 * Handles:
 * - Initial wallet loading when modal opens
 * - Periodic auto-refresh for owner viewing their own wallets
 * - Active state synchronization with connected wallets
 */
export function useWalletList({
  userId,
  connectedWallets,
  isOpen,
  isOwner,
}: UseWalletListParams): UseWalletListReturn {
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadWallets = useCallback(
    async (silent = false) => {
      if (!userId) {
        return;
      }

      if (!silent) {
        setIsRefreshing(true);
      }

      try {
        const loadedWallets = await fetchWallets(userId);
        setWallets(mapWalletsWithActiveState(loadedWallets, connectedWallets));
      } catch {
        // Handled by service-level response normalization.
      } finally {
        if (!silent) {
          setIsRefreshing(false);
        }
      }
    },
    [userId, connectedWallets]
  );

  useEffect(() => {
    if (isOpen && userId) {
      void loadWallets();
    }
  }, [isOpen, userId, loadWallets]);

  useEffect(() => {
    if (!isOpen || !userId || !isOwner) {
      return;
    }

    const interval = setInterval(() => {
      void loadWallets(true);
    }, TIMINGS.WALLET_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [isOpen, userId, isOwner, loadWallets]);

  return {
    wallets,
    setWallets,
    isRefreshing,
    loadWallets,
  };
}
