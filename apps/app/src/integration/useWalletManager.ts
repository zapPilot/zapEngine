import {
  useWalletLabels,
  useWalletList,
  useWalletMutations,
} from '@zapengine/app-core/hooks/wallet';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import type { WalletData } from '@zapengine/app-core/lib/validation/walletUtils';
import { equalsAddress } from '@zapengine/types/shared';
import type {
  EditingWallet,
  NewWallet,
  OperationState,
  WalletOperations,
  WalletOperationStateSetter,
} from '@zapengine/app-core/types';
import { useCallback, useMemo, useState } from 'react';

function createInitialOperations(): WalletOperations {
  return {
    adding: { isLoading: false, error: null },
    removing: {},
    editing: {},
    verifying: {},
    subscribing: { isLoading: false, error: null },
  };
}

export interface WalletManager {
  wallets: WalletData[];
  isRefreshing: boolean;
  reload: () => Promise<void>;
  addWallet: (
    wallet: NewWallet,
  ) => Promise<{ success: boolean; error?: string }>;
  addingState: OperationState;
  verifyWallet: (
    walletAddress: string,
  ) => Promise<{ success: boolean; error?: string }>;
  verifying: Record<string, OperationState>;
  deleteWallet: (walletId: string) => Promise<void>;
  removing: Record<string, OperationState>;
  editing: Record<string, OperationState>;
  saveLabel: (walletId: string, newLabel: string) => Promise<void>;
}

/**
 * Composite over app-core's wallet hooks for the /wallets screen. Mutations
 * are keyed to the real logged-in user id — a `?userId=` bundle view never
 * reaches this hook, so it cannot mutate someone else's bundle.
 */
export function useWalletManager(
  userId: string | null,
  activeAddress: string | null,
): WalletManager {
  const walletProvider = useWalletProvider();
  const [operations, setOperations] = useState<WalletOperations>(
    createInitialOperations,
  );
  // useWalletLabels clears this after a save; the rows keep their own inline
  // draft state, so only the setter is needed here.
  const [, setEditingWallet] = useState<EditingWallet | null>(null);

  const setWalletOperationState = useCallback<WalletOperationStateSetter>(
    (key, walletId, state) => {
      setOperations((prev) => ({
        ...prev,
        [key]: { ...prev[key], [walletId]: state },
      }));
    },
    [],
  );

  const connectedWallets = useMemo(
    () => (activeAddress ? [{ address: activeAddress, isActive: true }] : []),
    [activeAddress],
  );

  const list = useWalletList({
    userId,
    connectedWallets,
    isOpen: true,
    isOwner: true,
  });
  const { loadWallets } = list;
  const mutations = useWalletMutations({
    userId: userId ?? '',
    operations,
    setOperations,
    setWallets: list.setWallets,
    setWalletOperationState,
    loadWallets,
    signingAddress: activeAddress,
    signMessage: walletProvider.signMessage,
  });
  const verifyBundledWallet = mutations.handleVerifyWallet;
  const labels = useWalletLabels({
    userId: userId ?? '',
    wallets: list.wallets,
    setWallets: list.setWallets,
    setEditingWallet,
    setWalletOperationState,
  });

  // Drop press-event args so a tap never lands in loadWallets' `silent` flag.
  const reload = useCallback(async () => {
    await loadWallets();
  }, [loadWallets]);

  const verifyWallet = useCallback(
    async (walletAddress: string) => {
      if (!equalsAddress(activeAddress, walletAddress)) {
        await walletProvider.connect();
        return {
          success: false,
          error: 'Select this wallet, then tap Verify again.',
        };
      }
      return verifyBundledWallet(walletAddress);
    },
    [activeAddress, verifyBundledWallet, walletProvider],
  );

  return {
    wallets: list.wallets,
    isRefreshing: list.isRefreshing,
    reload,
    addWallet: mutations.handleAddWallet,
    addingState: mutations.addingState,
    verifyWallet,
    verifying: mutations.verifyingState,
    deleteWallet: mutations.handleDeleteWallet,
    removing: operations.removing,
    editing: operations.editing,
    saveLabel: labels.handleEditLabel,
  };
}
