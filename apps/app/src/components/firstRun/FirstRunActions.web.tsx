import { FirstRunActionsFrame } from './FirstRunActionsFrame';
import { useState } from 'react';
import { useWalletLogin } from '@zapengine/app-core/providers/WalletProvider';
import { Button } from '@/components/ui/Button';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { markFirstRunSeen } from '@/storage/firstRunStorage';
export function FirstRunActions({ onExplore }: { onExplore: () => void }) {
  const login = useWalletLogin();
  const { t } = useContentLanguage();
  const [error, setError] = useState<string | null>(null);
  const connect = async (kind: 'email' | 'wallet') => {
    await markFirstRunSeen();
    setError(null);
    try {
      if (kind === 'email') await login.connectPrivy();
      else login.openPicker();
    } catch {
      setError(t('firstRun.connectFailed'));
    }
  };
  return (
    <FirstRunActionsFrame error={error} onExplore={onExplore}>
      <Button
        disabled={login.isConnecting}
        onPress={() => void connect('email')}
      >
        {t('firstRun.email')}
      </Button>
      <Button
        variant="secondary"
        disabled={login.isConnecting}
        onPress={() => void connect('wallet')}
      >
        {t('firstRun.wallet')}
      </Button>
    </FirstRunActionsFrame>
  );
}
