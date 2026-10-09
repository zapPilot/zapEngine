import { ConnectGateCard } from '@/components/connect/ConnectGateCard';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function AccountUnavailableCard({
  onRetry,
  isRetrying = false,
  variant,
}: {
  onRetry: () => void;
  isRetrying?: boolean;
  variant: 'page' | 'overlay';
}) {
  const { t } = useContentLanguage();
  return (
    <ConnectGateCard
      variant={variant}
      title={t('account.unavailableTitle')}
      body={t('account.unavailableBody')}
      onConnect={onRetry}
      actionLabel={t('common.retry')}
      isConnecting={isRetrying}
    />
  );
}
