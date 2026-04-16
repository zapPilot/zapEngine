import { type Dispatch, type SetStateAction, useCallback } from "react";

import { updateWalletLabel as updateWalletLabelRequest } from "@/components/WalletManager/services/WalletService";
import type {
  EditingWallet,
  WalletOperationStateSetter,
} from "@/components/WalletManager/types/wallet.types";
import {
  handleWalletError,
  type WalletData,
} from "@/lib/validation/walletUtils";

interface UseWalletLabelsParams {
  userId: string;
  wallets: WalletData[];
  setWallets: Dispatch<SetStateAction<WalletData[]>>;
  setEditingWallet: Dispatch<SetStateAction<EditingWallet | null>>;
  setWalletOperationState: WalletOperationStateSetter;
}

interface UseWalletLabelsReturn {
  handleEditLabel: (walletId: string, newLabel: string) => Promise<void>;
}

const UPDATE_LABEL_FAILED_ERROR = "Failed to update wallet label";

function updateWalletEntryLabel(
  previousWallets: WalletData[],
  walletId: string,
  label: string
): WalletData[] {
  return previousWallets.map(wallet =>
    wallet.id === walletId ? { ...wallet, label } : wallet
  );
}

/**
 * Hook for wallet label editing operations
 *
 * Handles:
 * - Optimistic label updates
 * - API synchronization
 * - Rollback on failure
 */
export function useWalletLabels({
  userId,
  wallets,
  setWallets,
  setEditingWallet,
  setWalletOperationState,
}: UseWalletLabelsParams): UseWalletLabelsReturn {
  const setEditingState = useCallback(
    (walletId: string, isLoading: boolean, error: string | null) => {
      setWalletOperationState("editing", walletId, {
        isLoading,
        error,
      });
    },
    [setWalletOperationState]
  );

  const handleEditLabel = useCallback(
    async (walletId: string, newLabel: string) => {
      if (!userId || !newLabel.trim()) {
        setEditingWallet(null);
        return;
      }

      const wallet = wallets.find(w => w.id === walletId);
      if (!wallet) {
        setEditingWallet(null);
        return;
      }

      setEditingState(walletId, true, null);
      const updateLabel = (label: string) => {
        setWallets(previousWallets =>
          updateWalletEntryLabel(previousWallets, walletId, label)
        );
      };

      try {
        updateLabel(newLabel);
        setEditingWallet(null);

        const response = await updateWalletLabelRequest(
          userId,
          wallet.address,
          newLabel
        );

        if (!response.success) {
          updateLabel(wallet.label);
          setEditingState(
            walletId,
            false,
            response.error ?? UPDATE_LABEL_FAILED_ERROR
          );
          return;
        }

        setEditingState(walletId, false, null);
      } catch (error) {
        updateLabel(wallet.label);
        const errorMessage = handleWalletError(error);
        setEditingState(walletId, false, errorMessage);
      }
    },
    [userId, wallets, setWallets, setEditingWallet, setEditingState]
  );

  return {
    handleEditLabel,
  };
}
