import { Icon } from '@/components/ui/Icon';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import * as Linking from 'expo-linking';
import { Bell } from 'lucide-react-native';
import { useCallback } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Tap } from '@/components/ui/Tap';
import { useAccount } from '@/integration/useAccount';
import { useTelegramConnection } from '@/integration/useTelegramConnection';

/**
 * Account-screen card that connects Telegram for portfolio alerts. Wraps the
 * deep-link + poll flow from {@link useTelegramConnection}; the backend and
 * app-core service are unchanged from the original settings-modal feature.
 */
export function TelegramCard() {
  const { t } = useContentLanguage();
  const account = useAccount();
  const openLink = useCallback((url: string) => {
    void Linking.openURL(url);
  }, []);
  const telegram = useTelegramConnection({
    userId: account.userId,
    openLink,
  });
  const { view } = telegram;

  return (
    <Card className="mt-4 p-5">
      <View className="flex-row items-center gap-2">
        <Icon icon={Bell} size="sm" tone="sign" />
        <Text className="font-text-semibold text-body text-ink">
          Telegram notifications
        </Text>
      </View>

      {!telegram.enabled ? (
        <Text className="font-text mt-2 text-caption leading-5 text-ink-2">
          Connect your wallet first to enable notifications.
        </Text>
      ) : view.kind === 'locked' ? (
        <>
          <Text className="font-text mt-2 text-body-sm text-ink-2">
            {t('home.telegramLocked')}
          </Text>
          <Button
            className="mt-3"
            variant="secondary"
            onPress={telegram.connect}
          >
            {t('home.signIn')}
          </Button>
        </>
      ) : view.kind === 'loading' ? (
        <Text className="font-text mt-2 text-caption leading-5 text-ink-2">
          Checking connection…
        </Text>
      ) : view.kind === 'connecting' ? (
        <>
          <Text className="font-text mt-2 text-caption leading-5 text-ink-2">
            Open Telegram and tap Start to finish connecting. Waiting for
            confirmation…
          </Text>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Re-open Telegram link"
            onPress={() => openLink(view.deepLink)}
            className="mt-3"
          >
            <Text className="text-caption font-text-semibold text-ink">
              Re-open Telegram link
            </Text>
          </Tap>
        </>
      ) : view.kind === 'error' ? (
        <>
          <Text className="font-text mt-2 text-caption leading-5 text-ink-2">
            {view.message}
          </Text>
          <Button className="mt-3" variant="secondary" onPress={telegram.retry}>
            Try again
          </Button>
        </>
      ) : view.status.isConnected ? (
        <>
          <Text className="font-text mt-2 text-caption leading-5 text-ink-2">
            Connected. Portfolio alerts and strategy suggestions are on.
          </Text>
          <Button
            className="mt-3"
            variant="secondary"
            disabled={telegram.isDisconnecting}
            onPress={telegram.disconnect}
          >
            {telegram.isDisconnecting
              ? 'Disconnecting…'
              : 'Disconnect Telegram'}
          </Button>
        </>
      ) : (
        <>
          <Text className="font-text mt-2 text-caption leading-5 text-ink-2">
            Connect Telegram to receive portfolio alerts and strategy
            suggestions.
          </Text>
          <Button
            className="mt-3"
            variant="secondary"
            onPress={telegram.connect}
          >
            Connect Telegram
          </Button>
        </>
      )}
    </Card>
  );
}
