import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useAppUpdate } from '@/hooks/useAppUpdate';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function AppVersionCard() {
  const { view, update, install, retry } = useAppUpdate();
  const { t } = useContentLanguage();
  if (view.status === 'hidden') return null;
  const message =
    view.status === 'available'
      ? `${t('account.updateAvailable')} ${view.latestVersion ?? ''}`
      : view.status === 'downloading'
        ? `${t('account.updateDownloading')} ${view.percent}%`
        : view.status === 'up-to-date'
          ? t('account.updateCurrent')
          : view.status === 'move-to-applications'
            ? t('account.updateMove')
            : view.status === 'error'
              ? t('account.updateError')
              : view.status === 'checking'
                ? t('account.updateChecking')
                : view.status === 'installing'
                  ? t('account.updateInstalling')
                  : undefined;
  return (
    <Card className="mt-4 p-5">
      <Text>{t('account.updateBrand')}</Text>
      <Text>
        {t('account.updateVersion')} {view.currentVersion}
      </Text>
      {message ? <Text>{message}</Text> : null}
      {view.status === 'available' ? (
        <Button onPress={update}>{t('account.updateAction')}</Button>
      ) : null}
      {view.status === 'ready' ? (
        <Button onPress={install}>{t('account.updateRestart')}</Button>
      ) : null}
      {view.status === 'error' ? (
        <Button onPress={retry}>{t('account.updateRetry')}</Button>
      ) : null}
    </Card>
  );
}
