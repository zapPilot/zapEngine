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
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Tap } from '@/components/ui/Tap';
import { useAccount } from '@/integration/useAccount';

export function DeleteAccountCard() {
  const router = useRouter();
  const account = useAccount();
  const wallet = useWalletProvider();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!account.userId || !account.address) {
    return null;
  }
  const userId = account.userId;
  const address = account.address;

  const deleteAccount = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      const challenge = await requestAccountDeletionChallenge(userId, address);
      const signature = await wallet.signMessage(challenge.message);

      // Teardown is an explicit identity boundary: once deletion starts, no
      // remount/refetch may bootstrap this connected wallet into a new user.
      suspendAccountBootstrap(address);
      try {
        await deleteUser(userId, address, signature);
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

  return (
    <Card className="mt-8 border border-[rgba(239,116,116,.32)] p-5">
      <Text className="font-sans-semibold text-[15px] text-[#ef9292]">
        Delete account
      </Text>
      <Text className="mt-2 text-[12px] leading-[18px] text-ink-dim">
        Permanently deletes your Zap Pilot account, wallet bundle, and
        associated metadata. Your on-chain assets are never touched. Bundled
        wallets are released and can be added to another Zap Pilot account.
      </Text>

      {isConfirming ? (
        <View className="mt-4 gap-3">
          <Text className="text-[12px] leading-[18px] text-[#ef9292]">
            This cannot be undone. Your wallet will ask you to sign a deletion
            message before anything is removed.
          </Text>
          {error ? (
            <Text className="text-[11.5px] leading-[16px] text-[#ef9292]">
              {error}
            </Text>
          ) : null}
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Confirm delete Zap Pilot account"
            className="min-h-12 items-center justify-center rounded-[15px] border border-[rgba(239,116,116,.5)] bg-[rgba(239,116,116,.1)] px-4"
            disabled={isDeleting}
            onPress={() => void deleteAccount()}
          >
            <Text className="font-sans-semibold text-[14px] text-[#ef9292]">
              {isDeleting ? 'Waiting for signature…' : 'Sign & delete account'}
            </Text>
          </Tap>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Cancel account deletion"
            className="min-h-10 items-center justify-center"
            disabled={isDeleting}
            onPress={() => {
              setError(null);
              setIsConfirming(false);
            }}
          >
            <Text className="font-sans-semibold text-[12px] text-ink-dim">
              Cancel
            </Text>
          </Tap>
        </View>
      ) : (
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Delete Zap Pilot account"
          className="mt-4 min-h-12 items-center justify-center rounded-[15px] border border-[rgba(239,116,116,.4)] px-4"
          onPress={() => setIsConfirming(true)}
        >
          <Text className="font-sans-semibold text-[14px] text-[#ef9292]">
            Delete account
          </Text>
        </Tap>
      )}
    </Card>
  );
}
