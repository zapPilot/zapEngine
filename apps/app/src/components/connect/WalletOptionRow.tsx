import { tokens } from '@zapengine/design-tokens/tokens';
import type { WalletConnectorOption } from '@zapengine/app-core/types';
import { ChevronRight } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { WalletBrandIcon } from '@/components/connect/WalletBrandIcon';
import { CONNECT_SHEET_COPY } from '@/components/connect/connectCopy';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
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
        showBorder && 'border-b border-rule',
        disabled && !isConnecting && 'opacity-45',
      )}
    >
      <WalletBrandIcon
        {...(option.icon ? { icon: option.icon } : {})}
        size={36}
        muted={!option.recommended}
      />

      <View className="flex-1">
        <Text className="font-text-semibold text-body-sm text-ink">
          {option.name}
        </Text>
        <Text className="mt-0.5 font-mono text-data text-ink-3">
          {isConnecting
            ? CONNECT_SHEET_COPY.connectingSubtitle
            : CONNECT_SHEET_COPY.browserExtensionSubtitle}
        </Text>
      </View>

      {option.recommended ? (
        <Badge
          className="border bg-sign-wash"
          style={{ borderColor: tokens.mode.night['sign-ink'] }}
        >
          <Text className="font-mono text-data uppercase tracking-[1px] text-sign-ink">
            {CONNECT_SHEET_COPY.recommendedLabel}
          </Text>
        </Badge>
      ) : null}

      {isConnecting ? (
        <Spinner />
      ) : (
        <Icon icon={ChevronRight} size="sm" tone="muted" />
      )}
    </Tap>
  );
}
