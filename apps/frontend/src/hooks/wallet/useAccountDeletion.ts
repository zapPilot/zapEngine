import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { TIMINGS } from '@/constants/timings';
import { WALLET_MESSAGES } from '@/constants/wallet';
import { useUser } from '@/contexts/UserContext';
import { invalidateAndRefetch } from '@/hooks/utils/useQueryInvalidation';
import { queryKeys } from '@/lib/state/queryClient';
import { handleWalletError } from '@/lib/validation/walletUtils';
import { useToast } from '@/providers/ToastProvider';
import { useWalletProvider } from '@/providers/WalletProvider';
import { deleteUser as deleteUserAccount } from '@/services';

interface UseAccountDeletionParams {
  userId: string;
}

interface UseAccountDeletionReturn {
  isDeletingAccount: boolean;
  handleDeleteAccount: () => Promise<void>;
}

/**
 * Hook for account deletion operations
 *
 * Handles:
 * - Account deletion with confirmation
 * - Wallet disconnection on successful deletion
 * - Query invalidation and cleanup
 * - Page reload to reset application state
 */
export function useAccountDeletion({
  userId,
}: UseAccountDeletionParams): UseAccountDeletionReturn {
  const queryClient = useQueryClient();
  const { refetch } = useUser();
  const { showToast } = useToast();
  const { disconnect, isConnected } = useWalletProvider();
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Handle delete account
  const handleDeleteAccount = useCallback(async () => {
    if (!userId) return;

    setIsDeletingAccount(true);

    try {
      await deleteUserAccount(userId);

      let shouldReload = true;

      if (isConnected) {
        try {
          await disconnect();
        } catch (disconnectError) {
          const disconnectMessage =
            handleWalletError(disconnectError) ||
            "Account deleted, but we couldn't disconnect your wallet automatically.";

          showToast({
            type: 'warning',
            title: WALLET_MESSAGES.DISCONNECT_WALLET,
            message: `${disconnectMessage} Please disconnect manually to prevent automatic reconnection.`,
          });

          shouldReload = false;
        }
      }

      showToast({
        type: 'success',
        title: 'Account Deleted',
        message:
          'Account successfully deleted. Wallet connection has been cleared to prevent automatic reconnection.',
      });

      // Invalidate queries and trigger reconnection flow
      await invalidateAndRefetch({
        queryClient,
        queryKey: queryKeys.user.wallets(userId),
        refetch,
        operationName: 'account deletion',
      });

      if (shouldReload) {
        // Close the wallet manager after a brief delay
        setTimeout(() => {
          // Trigger logout/reconnect flow
          window.location.reload();
        }, TIMINGS.MODAL_CLOSE_DELAY);
      }
    } catch (error) {
      const errorMessage = handleWalletError(error);
      showToast({
        type: 'error',
        title: WALLET_MESSAGES.DELETION_FAILED,
        message: errorMessage,
      });
    } finally {
      setIsDeletingAccount(false);
    }
  }, [userId, queryClient, refetch, showToast, disconnect, isConnected]);

  return {
    isDeletingAccount,
    handleDeleteAccount,
  };
}
