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
        'min-h-[44px] flex-row items-center gap-3 rounded-2xl border px-4 py-4',
        disabled && !isConnecting && 'opacity-45',
      )}
      style={{
        borderColor: 'rgba(212,197,163,.28)',
        backgroundColor: 'rgba(212,197,163,.08)',
      }}
    >
      <View
        className="h-10 w-10 items-center justify-center rounded-xl border"
        style={{
          borderColor: 'rgba(212,197,163,.3)',
          backgroundColor: 'rgba(212,197,163,.12)',
        }}
      >
        <Mail size={18} strokeWidth={1.75} color="#d4c5a3" />
      </View>
      <View className="flex-1">
        <Text className="font-sans-semibold text-[14.5px] text-ink">
          {CONNECT_SHEET_COPY.privyTitle}
        </Text>
        <Text className="mt-0.5 font-sans text-[11.5px] text-ink-dim">
          {CONNECT_SHEET_COPY.privySubtitle}
        </Text>
      </View>
      {isConnecting ? (
        <ActivityIndicator color="#d4c5a3" />
      ) : (
        <ChevronRight size={18} strokeWidth={2} color="#d4c5a3" />
      )}
    </Tap>
  );
}
