import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import { ArrowDown, ArrowDownUp } from 'lucide-react-native';
import { View } from 'react-native';

import { Tap } from '@/components/ui/Tap';

interface SwapArrowDividerProps {
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

const CIRCLE_CLASS =
  'h-10 w-10 items-center justify-center rounded-round border-4 border-ground bg-well';

export function SwapArrowDivider({
  onPress,
  disabled = false,
  accessibilityLabel,
}: SwapArrowDividerProps) {
  if (!onPress) {
    return (
      <View accessible={false} className="z-10 -my-2.5 self-center">
        <View className={CIRCLE_CLASS}>
          <Icon icon={ArrowDown} size="sm" tone="secondary" />
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
        className={cn(CIRCLE_CLASS, disabled ? 'opacity-40' : '')}
        disabled={disabled}
        hitSlop={8}
        onPress={onPress}
      >
        <Icon icon={ArrowDownUp} size="sm" tone="secondary" />
      </Tap>
    </View>
  );
}
