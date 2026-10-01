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
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

import { Card } from '@/components/ui/Card';
import { useAccount } from '@/integration/useAccount';

export function DeleteAccountCard() {
  const { t } = useContentLanguage();
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
    <Card className="mt-8 border border-danger-line" padding="md">
      <Text variant="subheading" tone="danger">
        {t('account.deleteTitle')}
      </Text>
      <Text variant="body-sm" tone="secondary" className="mt-2">
        {t('account.deleteBody')}
      </Text>
      <Button
        variant="destructive"
        className="mt-4"
        accessibilityLabel={t('account.deleteOpen')}
        onPress={() => setIsConfirming(true)}
      >
        {t('account.deleteTitle')}
      </Button>
      <ConfirmSheet
        visible={isConfirming}
        title={t('account.deleteTitle')}
        closeLabel={t('account.deleteCancel')}
        cancelLabel={t('account.deleteCancel')}
        confirmLabel={
          isDeleting ? t('account.deleteWaiting') : t('account.deleteConfirm')
        }
        body={t('account.deleteWarning')}
        busy={isDeleting}
        destructive
        onConfirm={() => void deleteAccount()}
        onClose={() => {
          setError(null);
          setIsConfirming(false);
        }}
      >
        {error ? (
          <Text
            variant="caption"
            tone="danger"
            accessibilityRole="alert"
            className="mt-3"
          >
            {error}
          </Text>
        ) : null}
      </ConfirmSheet>
    </Card>
  );
}
