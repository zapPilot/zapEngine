import * as Linking from 'expo-linking';
import { Bell } from 'lucide-react-native';
import { useCallback } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Tap } from '@/components/ui/Tap';
import { useAccount } from '@/integration/useAccount';
import { useTelegramConnection } from '@/integration/useTelegramConnection';

/**
 * Account-screen card that connects Telegram for portfolio alerts. Wraps the
 * deep-link + poll flow from {@link useTelegramConnection}; the backend and
 * app-core service are unchanged from the original settings-modal feature.
 */
export function TelegramCard() {
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
        <Bell size={16} strokeWidth={1.8} color="#d4c5a3" />
        <Text className="font-sans-semibold text-[15px] text-ink">
          Telegram notifications
        </Text>
      </View>

      {!telegram.enabled ? (
        <Text className="mt-2 text-[12.5px] leading-5 text-ink-dim">
          Connect your wallet first to enable notifications.
        </Text>
      ) : view.kind === 'loading' ? (
        <Text className="mt-2 text-[12.5px] leading-5 text-ink-dim">
          Checking connection…
        </Text>
      ) : view.kind === 'connecting' ? (
        <>
          <Text className="mt-2 text-[12.5px] leading-5 text-ink-dim">
            Open Telegram and tap Start to finish connecting. Waiting for
            confirmation…
          </Text>
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Re-open Telegram link"
            onPress={() => openLink(view.deepLink)}
            className="mt-3"
          >
            <Text className="text-[12.5px] font-sans-semibold text-accent">
              Re-open Telegram link
            </Text>
          </Tap>
        </>
      ) : view.kind === 'error' ? (
        <>
          <Text className="mt-2 text-[12.5px] leading-5 text-ink-dim">
            {view.message}
          </Text>
          <PrimaryButton
            className="mt-3"
            variant="secondary"
            onPress={telegram.retry}
          >
            Try again
          </PrimaryButton>
        </>
      ) : view.status.isConnected ? (
        <>
          <Text className="mt-2 text-[12.5px] leading-5 text-ink-dim">
            Connected. Portfolio alerts and strategy suggestions are on.
          </Text>
          <PrimaryButton
            className="mt-3"
            variant="secondary"
            disabled={telegram.isDisconnecting}
            onPress={telegram.disconnect}
          >
            {telegram.isDisconnecting
              ? 'Disconnecting…'
              : 'Disconnect Telegram'}
          </PrimaryButton>
        </>
      ) : (
        <>
          <Text className="mt-2 text-[12.5px] leading-5 text-ink-dim">
            Connect Telegram to receive portfolio alerts and strategy
            suggestions.
          </Text>
          <PrimaryButton
            className="mt-3"
            variant="secondary"
            onPress={telegram.connect}
          >
            Connect Telegram
          </PrimaryButton>
        </>
      )}
    </Card>
  );
}
