import {
  resumeAccountBootstrap,
  suspendAccountBootstrap,
} from '@zapengine/app-core/lib/state/accountBootstrap';
import { queryClient } from '@zapengine/app-core/lib/state/queryClient';
import { useWalletProvider } from '@zapengine/app-core/providers/walletContext';
import {
  deleteUser,
  requestAccountDeletionChallenge,
} from '@zapengine/app-core/services/accountService';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useAccount } from '@/integration/useAccount';
export function useDeleteAccount() {
  const router = useRouter();
  const account = useAccount();
  const wallet = useWalletProvider();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = account.userId;
  const address = account.address;

  const deleteAccount = async () => {
    if (!userId || !address) return;
    setError(null);
    setIsDeleting(true);
    try {
      const challenge = await requestAccountDeletionChallenge(userId, address);
      const signature = await wallet.signMessage(challenge.message);

      // Teardown is an explicit identity boundary: once deletion starts, no
      // remount/refetch may bootstrap this connected wallet into a new user.
      suspendAccountBootstrap(address);
      try {
        await deleteUser(userId, challenge.challengeId, signature);
      } catch (error) {
        resumeAccountBootstrap(address);
        throw error;
      }

      await wallet.disconnect();
      queryClient.clear();
      router.replace('/');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Failed to delete account.',
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    available: Boolean(userId && address),
    isConfirming,
    setIsConfirming,
    isDeleting,
    error,
    setError,
    deleteAccount,
  };
}
