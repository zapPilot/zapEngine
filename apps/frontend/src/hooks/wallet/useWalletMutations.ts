import { useQueryClient } from "@tanstack/react-query";
import { type Dispatch, type SetStateAction, useCallback } from "react";

import {
  addWallet as addWalletToBundle,
  removeWallet as removeWalletFromBundle,
} from "@/components/WalletManager/services/WalletService";
import type {
  NewWallet,
  WalletOperations,
  WalletOperationStateSetter,
} from "@/components/WalletManager/types/wallet.types";
import { validateNewWallet } from "@/components/WalletManager/utils/validation";
import { useUser } from "@/contexts/UserContext";
import { invalidateAndRefetch } from "@/hooks/utils/useQueryInvalidation";
import { queryKeys } from "@/lib/state/queryClient";
import {
  handleWalletError,
  type WalletData,
} from "@/lib/validation/walletUtils";

interface UseWalletMutationsParams {
  userId: string;
  operations: WalletOperations;
  setOperations: Dispatch<SetStateAction<WalletOperations>>;
  setWallets: Dispatch<SetStateAction<WalletData[]>>;
  setWalletOperationState: WalletOperationStateSetter;
  loadWallets: () => Promise<void>;
}

interface WalletMutationResult {
  success: boolean;
  error?: string;
}

interface UseWalletMutationsReturn {
  handleDeleteWallet: (walletId: string) => Promise<void>;
  handleAddWallet: (newWallet: NewWallet) => Promise<WalletMutationResult>;
  addingState: WalletOperations["adding"];
}

const USER_ID_REQUIRED_ERROR = "User ID is required";
const INVALID_WALLET_DATA_ERROR = "Invalid wallet data";
const REMOVE_WALLET_ERROR = "Failed to remove wallet";
const ADD_WALLET_ERROR = "Failed to add wallet";
const REMOVE_OPERATION_NAME = "wallet removal";
const ADD_OPERATION_NAME = "adding wallet";

function createFailureResult(error: string): WalletMutationResult {
  return { success: false, error };
}

/**
 * Hook for wallet mutation operations (add/delete)
 *
 * Handles:
 * - Adding new wallets with validation
 * - Removing wallets with optimistic updates
 * - Query invalidation and refetch after mutations
 */
export function useWalletMutations({
  userId,
  operations,
  setOperations,
  setWallets,
  setWalletOperationState,
  loadWallets,
}: UseWalletMutationsParams): UseWalletMutationsReturn {
  const queryClient = useQueryClient();
  const { refetch } = useUser();

  const setRemovingState = useCallback(
    (walletId: string, isLoading: boolean, error: string | null) => {
      setWalletOperationState("removing", walletId, {
        isLoading,
        error,
      });
    },
    [setWalletOperationState]
  );

  const setAddingState = useCallback(
    (isLoading: boolean, error: string | null) => {
      setOperations(prev => ({
        ...prev,
        adding: { isLoading, error },
      }));
    },
    [setOperations]
  );

  // Handle wallet deletion
  const handleDeleteWallet = useCallback(
    async (walletId: string) => {
      if (!userId) {
        return;
      }

      setRemovingState(walletId, true, null);

      try {
        const response = await removeWalletFromBundle(userId, walletId);
        if (!response.success) {
          setRemovingState(
            walletId,
            false,
            response.error ?? REMOVE_WALLET_ERROR
          );
          return;
        }

        setWallets(prev => prev.filter(wallet => wallet.id !== walletId));

        await invalidateAndRefetch({
          queryClient,
          queryKey: queryKeys.user.wallets(userId),
          refetch,
          operationName: REMOVE_OPERATION_NAME,
        });

        setRemovingState(walletId, false, null);
      } catch (error) {
        const errorMessage = handleWalletError(error);
        setRemovingState(walletId, false, errorMessage);
      }
    },
    [userId, queryClient, refetch, setRemovingState, setWallets]
  );

  // Handle adding new wallet
  const handleAddWallet = useCallback(
    async (newWallet: NewWallet): Promise<WalletMutationResult> => {
      if (!userId) {
        return { success: false, error: USER_ID_REQUIRED_ERROR };
      }

      const validation = validateNewWallet(newWallet);
      if (!validation.isValid) {
        return createFailureResult(
          validation.error ?? INVALID_WALLET_DATA_ERROR
        );
      }

      setAddingState(true, null);

      try {
        const response = await addWalletToBundle(
          userId,
          newWallet.address,
          newWallet.label
        );

        if (!response.success) {
          const error = response.error ?? ADD_WALLET_ERROR;
          setAddingState(false, error);
          return createFailureResult(error);
        }

        await loadWallets();

        await invalidateAndRefetch({
          queryClient,
          queryKey: queryKeys.user.wallets(userId),
          refetch,
          operationName: ADD_OPERATION_NAME,
        });

        setAddingState(false, null);

        return { success: true };
      } catch (error) {
        const errorMessage = handleWalletError(error);
        setAddingState(false, errorMessage);
        return createFailureResult(errorMessage);
      }
    },
    [userId, loadWallets, queryClient, refetch, setAddingState]
  );

  return {
    handleDeleteWallet,
    handleAddWallet,
    addingState: operations.adding,
  };
}
