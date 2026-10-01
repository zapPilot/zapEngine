import { ScreenCrashBoundary } from '@/components/ui/ScreenCrashBoundary';
import { unsubscribeFromReportsWithToken } from '@zapengine/app-core/services/accountService';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactElement } from 'react';
import { Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { ScreenScrollView } from '@/components/ui/ScreenScrollView';

type UnsubscribeStatus = 'ready' | 'submitting' | 'success' | 'error';

export default function UnsubscribeRoute(): ReactElement {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const [status, setStatus] = useState<UnsubscribeStatus>('ready');

  const unsubscribe = useCallback(async () => {
    if (!token) {
      setStatus('error');
      return;
    }

    setStatus('submitting');
    try {
      await unsubscribeFromReportsWithToken(token);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }, [token]);

  const isMissingToken = !token;
  const hasError = status === 'error' || isMissingToken;

  return (
    <ScreenCrashBoundary screen="unsubscribe">
      <ScreenScrollView width="narrow">
        <PageHeader title="Email preferences" />
        <View className="px-5 pt-5">
          <Card className="p-5">
            <Text className="font-sans-semibold text-[17px] text-ink">
              {status === 'success'
                ? 'Weekly reports are turned off'
                : 'Unsubscribe from weekly reports?'}
            </Text>
            <Text className="mt-2 text-[13px] leading-5 text-ink-dim">
              {status === 'success'
                ? 'You will no longer receive Zap Pilot weekly portfolio reports. You can subscribe again from the app at any time.'
                : 'This stops weekly portfolio emails for the address linked to this report. It does not change your wallets or assets.'}
            </Text>

            {hasError ? (
              <Callout
                tone="danger"
                className="mt-5"
                title="This link could not be verified"
                body="The unsubscribe link is invalid or no longer matches the email address on the account."
                {...(token
                  ? {
                      action: {
                        label: 'Try again',
                        onPress: () => {
                          void unsubscribe();
                        },
                      },
                    }
                  : {})}
              />
            ) : null}

            {status === 'ready' ? (
              <Button
                className="mt-5"
                onPress={() => {
                  void unsubscribe();
                }}
              >
                Unsubscribe
              </Button>
            ) : null}

            {status === 'submitting' ? (
              <Button className="mt-5" disabled>
                Updating…
              </Button>
            ) : null}
          </Card>
        </View>
      </ScreenScrollView>
    </ScreenCrashBoundary>
  );
}
