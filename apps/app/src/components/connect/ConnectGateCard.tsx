import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import { Wallet } from 'lucide-react-native';
import { Platform, Text, View } from 'react-native';

import {
  CONNECT_GATE_COPY,
  CONNECTING_LABEL,
} from '@/components/connect/connectGateCopy';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';
import { NATIVE_PRIVY_AUTH_COPY } from '@/integration/nativePrivyLogin';

interface ConnectGateCardProps {
  title: string;
  body: string;
  /** 'page' = route-gate headline (serif, left); 'overlay' = floating demo card (icon, centered). */
  variant: 'page' | 'overlay';
  onConnect: () => void;
  isConnecting?: boolean | undefined;
  /** Override the platform sign-in label for recovery actions. */
  actionLabel?: string | undefined;
  /** Non-null renders the generic sign-in-unavailable error card. */
  error?: string | null | undefined;
}

/** Shared sign-in prompt — used by the route guard and the home demo overlay. */
export function ConnectGateCard({
  title,
  body,
  variant,
  onConnect,
  isConnecting = false,
  actionLabel,
  error = null,
}: ConnectGateCardProps) {
  const isWeb = Platform.OS === 'web';
  const isPage = variant === 'page';
  const cta =
    actionLabel ??
    (isWeb ? CONNECT_GATE_COPY.webCta : NATIVE_PRIVY_AUTH_COPY.cta);

  return (
    <Card className={isPage ? 'p-5' : 'items-center p-6'}>
      {isPage ? null : (
        <View className="h-11 w-11 items-center justify-center rounded-round border border-sign-ink bg-sign-wash">
          <Icon icon={Wallet} size="md" tone="sign" />
        </View>
      )}
      <Text
        className={
          isPage
            ? 'font-display text-title leading-[32px] text-ink'
            : 'mt-3 text-center font-text-semibold text-body text-ink'
        }
      >
        {title}
      </Text>
      <Text
        className={cn(
          'font-text text-body',
          isPage
            ? 'mt-3 text-body-sm leading-5 text-ink-2'
            : 'mt-1 text-center text-caption leading-5 text-ink-2',
        )}
      >
        {body}
      </Text>
      <Button
        className={isPage ? 'mt-5' : 'mt-4'}
        disabled={isConnecting}
        accessibilityRole="button"
        accessibilityLabel={cta}
        accessibilityHint={isWeb ? undefined : NATIVE_PRIVY_AUTH_COPY.hint}
        accessibilityState={{ disabled: isConnecting, busy: isConnecting }}
        onPress={onConnect}
      >
        {isConnecting ? CONNECTING_LABEL : cta}
      </Button>
      {!isConnecting && error ? (
        <Callout
          tone="alert"
          className="mt-4"
          title={
            isWeb
              ? CONNECT_GATE_COPY.errorTitleWeb
              : CONNECT_GATE_COPY.errorTitleNative
          }
          body={CONNECT_GATE_COPY.errorBody}
        />
      ) : null}
    </Card>
  );
}
