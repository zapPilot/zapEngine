import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { useDeleteAccount } from './useDeleteAccount';
export function RuntimeDeleteAccount() {
  const { t } = useContentLanguage();
  const deletion = useDeleteAccount();
  if (!deletion.available) return null;
  return (
    <Card className="mt-8 border border-alert" padding="md">
      <Text variant="heading" tone="alert">
        {t('account.deleteTitle')}
      </Text>
      <Text variant="body-sm" tone="secondary" className="mt-2">
        {t('account.deleteBody')}
      </Text>
      <Button
        variant="destructive"
        className="mt-4"
        accessibilityLabel={t('account.deleteOpen')}
        onPress={() => deletion.setIsConfirming(true)}
      >
        {t('account.deleteTitle')}
      </Button>
      <ConfirmSheet
        visible={deletion.isConfirming}
        title={t('account.deleteTitle')}
        closeLabel={t('account.deleteCancel')}
        cancelLabel={t('account.deleteCancel')}
        confirmLabel={
          deletion.isDeleting
            ? t('account.deleteWaiting')
            : t('account.deleteConfirm')
        }
        body={t('account.deleteWarning')}
        busy={deletion.isDeleting}
        destructive
        onConfirm={() => void deletion.deleteAccount()}
        onClose={() => {
          deletion.setError(null);
          deletion.setIsConfirming(false);
        }}
      >
        {deletion.error ? (
          <Text
            variant="caption"
            tone="alert"
            accessibilityRole="alert"
            className="mt-3"
          >
            {deletion.error}
          </Text>
        ) : null}
      </ConfirmSheet>
    </Card>
  );
}
