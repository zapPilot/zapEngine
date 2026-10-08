import { palette } from '@/lib/palette';
import { tokens } from '@zapengine/design-tokens/tokens';
import { Icon } from '@/components/ui/Icon';
import { ChevronRight, Mail } from 'lucide-react-native';
import { ActivityIndicator, Text, View } from 'react-native';

import { CONNECT_SHEET_COPY } from '@/components/connect/connectCopy';
import { Tap } from '@/components/ui/Tap';
import { cn } from '@/lib/cn';

interface PrivyLoginOptionProps {
  isConnecting: boolean;
  disabled: boolean;
  onPress: () => void;
}

/** The default, visually dominant login path — email/Google/Apple via Privy. */
export function PrivyLoginOption({
  isConnecting,
  disabled,
  onPress,
}: PrivyLoginOptionProps) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel="Continue with email or social login"
      accessibilityState={{ disabled, busy: isConnecting }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-[44px] flex-row items-center gap-3 rounded-panel border px-4 py-4',
        disabled && !isConnecting && 'opacity-45',
      )}
      style={{
        borderColor: tokens.mode.night['sign-ink'],
        backgroundColor: tokens.mode.night['sign-wash'],
      }}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-panel border"
        style={{
          borderColor: tokens.mode.night['sign-ink'],
          backgroundColor: tokens.mode.night['sign-wash'],
        }}
      >
        <Icon icon={Mail} size="md" tone="sign" />
      </View>
      <View className="flex-1">
        <Text className="font-text-semibold text-body text-ink">
          {CONNECT_SHEET_COPY.privyTitle}
        </Text>
        <Text className="mt-0.5 font-text text-label text-ink-2">
          {CONNECT_SHEET_COPY.privySubtitle}
        </Text>
      </View>
      {isConnecting ? (
        <ActivityIndicator color={palette['sign-ink']} />
      ) : (
        <Icon icon={ChevronRight} size="md" tone="sign" />
      )}
    </Tap>
  );
}
