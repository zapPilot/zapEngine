import { ArrowDown, ArrowDownUp } from 'lucide-react-native';
import { View } from 'react-native';

import { Tap } from '@/components/ui/Tap';

interface SwapArrowDividerProps {
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

const CIRCLE_CLASS =
  'h-10 w-10 items-center justify-center rounded-full border-4 border-bg bg-[#171719]';

export function SwapArrowDivider({
  onPress,
  disabled = false,
  accessibilityLabel,
}: SwapArrowDividerProps) {
  if (!onPress) {
    return (
      <View accessible={false} className="z-10 -my-2.5 self-center">
        <View className={CIRCLE_CLASS}>
          <ArrowDown size={16} color="#a1a1aa" />
        </View>
      </View>
    );
  }

  return (
    <View className="z-10 -my-2.5 self-center">
      <Tap
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled }}
        className={`${CIRCLE_CLASS} ${disabled ? 'opacity-40' : ''}`}
        disabled={disabled}
        hitSlop={8}
        onPress={onPress}
      >
        <ArrowDownUp size={16} color="#a1a1aa" />
      </Tap>
    </View>
  );
}
