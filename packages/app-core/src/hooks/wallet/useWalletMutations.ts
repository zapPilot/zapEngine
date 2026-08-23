import { useUser } from '@core/hooks/queries/wallet/useUser';
import { invalidateAndRefetch } from '@core/hooks/utils/useQueryInvalidation';
import { queryKeys } from '@core/lib/state/queryClient';
import {
  handleWalletError,
  type WalletData,
} from '@core/lib/validation/walletUtils';
import {
  addWallet as addWalletToBundle,
  removeWallet as removeWalletFromBundle,
  requestWalletBindingChallenge,
  verifyWallet as verifyBundledWallet,
} from '@core/services';
import type {
  NewWallet,
  WalletOperations,
  WalletOperationStateSetter,
} from '@core/types';
import { validateNewWallet } from '@core/utils';
import { logger } from '@core/utils/logger';
import { useQueryClient } from '@tanstack/react-query';
import { equalsAddress } from '@zapengine/types/shared';
import { type Dispatch, type SetStateAction, useCallback, useRef } from 'react';

interface UseWalletMutationsParams {
  userId: string;
  operations: WalletOperations;
  setOperations: Dispatch<SetStateAction<WalletOperations>>;
  setWallets: Dispatch<SetStateAction<WalletData[]>>;
  setWalletOperationState: WalletOperationStateSetter;
  loadWallets: () => Promise<void>;
  signingAddress: string | null;
  signMessage: (message: string) => Promise<string>;
}

interface WalletMutationResult {
  success: boolean;
  error?: string;
}

interface UseWalletMutationsReturn {
  handleDeleteWallet: (walletId: string) => Promise<void>;
  handleAddWallet: (newWallet: NewWallet) => Promise<WalletMutationResult>;
  handleVerifyWallet: (walletAddress: string) => Promise<WalletMutationResult>;
  addingState: WalletOperations['adding'];
  verifyingState: WalletOperations['verifying'];
}

const USER_ID_REQUIRED_ERROR = 'User ID is required';
const INVALID_WALLET_DATA_ERROR = 'Invalid wallet data';
const REMOVE_WALLET_ERROR = 'Failed to remove wallet';
const ADD_WALLET_ERROR = 'Failed to add wallet';
const REMOVE_OPERATION_NAME = 'wallet removal';
const ADD_OPERATION_NAME = 'adding wallet';
const VERIFY_WALLET_ERROR = 'Failed to verify wallet';
const VERIFY_SIGNER_ERROR = 'Switch to this wallet before verifying ownership';
const VERIFY_OPERATION_NAME = 'verifying wallet';
const walletMutationsLogger = logger.createContextLogger('WalletMutations');

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
  signingAddress,
  signMessage,
}: UseWalletMutationsParams): UseWalletMutationsReturn {
  const queryClient = useQueryClient();
  const { refetch } = useUser();
  const signingAddressRef = useRef(signingAddress);
  signingAddressRef.current = signingAddress;

  const setRemovingState = useCallback(
    (walletId: string, isLoading: boolean, error: string | null) => {
      setWalletOperationState('removing', walletId, {
        isLoading,
        error,
      });
    },
    [setWalletOperationState],
  );

  const setAddingState = useCallback(
    (isLoading: boolean, error: string | null) => {
      setOperations((prev) => ({
        ...prev,
        adding: { isLoading, error },
      }));
    },
    [setOperations],
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
            response.error ?? REMOVE_WALLET_ERROR,
          );
          return;
        }

        setWallets((prev) => prev.filter((wallet) => wallet.id !== walletId));

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
    [userId, queryClient, refetch, setRemovingState, setWallets],
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
          validation.error ?? INVALID_WALLET_DATA_ERROR,
        );
      }

      setAddingState(true, null);

      try {
        const response = await addWalletToBundle(
          userId,
          newWallet.address,
          undefined,
          newWallet.label,
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
    [userId, loadWallets, queryClient, refetch, setAddingState],
  );

  const handleVerifyWallet = useCallback(
    async (walletAddress: string): Promise<WalletMutationResult> => {
      if (!userId) {
        return createFailureResult(USER_ID_REQUIRED_ERROR);
      }

      const rejectStaleSigner = (): WalletMutationResult | null => {
        if (equalsAddress(signingAddressRef.current, walletAddress)) {
          return null;
        }
        setWalletOperationState('verifying', walletAddress, {
          isLoading: false,
          error: VERIFY_SIGNER_ERROR,
        });
        return createFailureResult(VERIFY_SIGNER_ERROR);
      };

      const signerFailure = rejectStaleSigner();
      if (signerFailure) {
        return signerFailure;
      }

      setWalletOperationState('verifying', walletAddress, {
        isLoading: true,
        error: null,
      });

      try {
        const challenge = await requestWalletBindingChallenge(
          userId,
          walletAddress,
        );
        const challengeSignerFailure = rejectStaleSigner();
        if (challengeSignerFailure) {
          return challengeSignerFailure;
        }

        const signature = await signMessage(challenge.message);
        const signatureSignerFailure = rejectStaleSigner();
        if (signatureSignerFailure) {
          return signatureSignerFailure;
        }

        const response = await verifyBundledWallet(
          userId,
          walletAddress,
          signature,
        );
        if (!response.success) {
          const error = response.error ?? VERIFY_WALLET_ERROR;
          setWalletOperationState('verifying', walletAddress, {
            isLoading: false,
            error,
          });
          return createFailureResult(error);
        }

        const refreshResults = await Promise.allSettled([
          invalidateAndRefetch({
            queryClient,
            queryKey: queryKeys.user.wallets(userId),
            refetch,
            operationName: VERIFY_OPERATION_NAME,
          }),
          loadWallets(),
        ]);
        for (const refreshResult of refreshResults) {
          if (refreshResult.status === 'rejected') {
            walletMutationsLogger.warn(
              '[wallet-verification] ownership persisted but wallet refresh failed:',
              refreshResult.reason,
            );
          }
        }

        setWalletOperationState('verifying', walletAddress, {
          isLoading: false,
          error: null,
        });
        return { success: true };
      } catch (error) {
        const errorMessage = handleWalletError(error);
        setWalletOperationState('verifying', walletAddress, {
          isLoading: false,
          error: errorMessage,
        });
        return createFailureResult(errorMessage);
      }
    },
    [
      userId,
      signMessage,
      setWalletOperationState,
      queryClient,
      refetch,
      loadWallets,
    ],
  );

  return {
    handleDeleteWallet,
    handleAddWallet,
    handleVerifyWallet,
    addingState: operations.adding,
    verifyingState: operations.verifying,
  };
}
