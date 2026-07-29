import type { WalletConnectorOption } from '@zapengine/app-core/types';
import { ChevronRight } from 'lucide-react-native';
import { ActivityIndicator, Text, View } from 'react-native';

import { WalletBrandIcon } from '@/components/connect/WalletBrandIcon';
import { CONNECT_SHEET_COPY } from '@/components/connect/connectCopy';
import { Pill } from '@/components/ui/Pill';
import { Tap } from '@/components/ui/Tap';
import { cn } from '@/lib/cn';

interface WalletOptionRowProps {
  option: WalletConnectorOption;
  isConnecting: boolean;
  disabled: boolean;
  showBorder: boolean;
  onPress: () => void;
}

export function WalletOptionRow({
  option,
  isConnecting,
  disabled,
  showBorder,
  onPress,
}: WalletOptionRowProps) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={
        option.recommended
          ? `Connect with ${option.name}, recommended`
          : `Connect with ${option.name}`
      }
      accessibilityState={{ disabled, busy: isConnecting }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-[48px] flex-row items-center gap-3 py-3',
        showBorder && 'border-b border-line',
        disabled && !isConnecting && 'opacity-45',
      )}
    >
      <WalletBrandIcon
        {...(option.icon ? { icon: option.icon } : {})}
        size={36}
        muted={!option.recommended}
      />

      <View className="flex-1">
        <Text className="font-sans-semibold text-[13.5px] text-ink">
          {option.name}
        </Text>
        <Text className="mt-0.5 font-mono text-[10px] text-ink-faint">
          {isConnecting
            ? CONNECT_SHEET_COPY.connectingSubtitle
            : CONNECT_SHEET_COPY.browserExtensionSubtitle}
        </Text>
      </View>

      {option.recommended ? (
        <Pill
          className="border bg-accent-soft"
          style={{ borderColor: 'rgba(212,197,163,.28)' }}
        >
          <Text className="font-mono text-[9px] uppercase tracking-[1px] text-accent">
            {CONNECT_SHEET_COPY.recommendedLabel}
          </Text>
        </Pill>
      ) : null}

      {isConnecting ? (
        <ActivityIndicator color="#d4c5a3" />
      ) : (
        <ChevronRight size={16} strokeWidth={2} color="#52525b" />
      )}
    </Tap>
  );
}
