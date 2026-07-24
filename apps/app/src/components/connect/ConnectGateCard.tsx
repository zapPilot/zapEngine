import { Wallet } from 'lucide-react-native';
import { Platform, Text, View } from 'react-native';

import {
  CONNECT_GATE_COPY,
  CONNECTING_LABEL,
} from '@/components/connect/connectCopy';
import { Card } from '@/components/ui/Card';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { NATIVE_PRIVY_AUTH_COPY } from '@/integration/nativePrivyLogin';

interface ConnectGateCardProps {
  title: string;
  body: string;
  /** 'page' = route-gate headline (serif, left); 'overlay' = floating demo card (icon, centered). */
  variant: 'page' | 'overlay';
  onConnect: () => void;
  isConnecting?: boolean | undefined;
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
  error = null,
}: ConnectGateCardProps) {
  const isWeb = Platform.OS === 'web';
  const isPage = variant === 'page';
  const cta = isWeb ? CONNECT_GATE_COPY.webCta : NATIVE_PRIVY_AUTH_COPY.cta;

  return (
    <Card className={isPage ? 'p-5' : 'items-center p-6'}>
      {isPage ? null : (
        <View className="h-11 w-11 items-center justify-center rounded-full border border-[rgba(212,197,163,.3)] bg-[rgba(212,197,163,.12)]">
          <Wallet size={19} strokeWidth={1.8} color="#d4c5a3" />
        </View>
      )}
      <Text
        className={
          isPage
            ? 'font-serif text-[27px] leading-[32px] text-ink'
            : 'mt-3 text-center font-sans-semibold text-[15px] text-ink'
        }
      >
        {title}
      </Text>
      <Text
        className={
          isPage
            ? 'mt-3 text-[13px] leading-5 text-ink-dim'
            : 'mt-1 text-center text-[12.5px] leading-5 text-ink-dim'
        }
      >
        {body}
      </Text>
      <PrimaryButton
        className={isPage ? 'mt-5' : 'mt-4'}
        disabled={isConnecting}
        accessibilityRole="button"
        accessibilityLabel={cta}
        accessibilityHint={isWeb ? undefined : NATIVE_PRIVY_AUTH_COPY.hint}
        accessibilityState={{ disabled: isConnecting, busy: isConnecting }}
        onPress={onConnect}
      >
        {isConnecting ? CONNECTING_LABEL : cta}
      </PrimaryButton>
      {!isConnecting && error ? (
        <InlineErrorCard
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
