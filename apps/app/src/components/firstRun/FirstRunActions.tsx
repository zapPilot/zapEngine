import { FirstRunActionsFrame } from './FirstRunActionsFrame';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAccount } from '@/integration/useAccount';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { markFirstRunSeen } from '@/storage/firstRunStorage';
export function FirstRunActions({ onExplore }: { onExplore: () => void }) {
  const account = useAccount();
  const { t } = useContentLanguage();
  const [error, setError] = useState<string | null>(null);
  const connect = async () => {
    await markFirstRunSeen();
    setError(null);
    try {
      await account.connect();
    } catch {
      setError(t('firstRun.connectFailed'));
    }
  };
  return (
    <FirstRunActionsFrame error={error} onExplore={onExplore}>
      <Button disabled={account.isConnecting} onPress={() => void connect()}>
        {t('firstRun.email')}
      </Button>
    </FirstRunActionsFrame>
  );
}
