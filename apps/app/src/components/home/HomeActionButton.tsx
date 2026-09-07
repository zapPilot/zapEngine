import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';

export function HomeActionButton({
  icon,
  label,
  onPress,
  primary = false,
  accessibilityLabel,
  showIndicator = false,
}: {
  icon: ReactNode;
  label: string;
  onPress: () => void;
  primary?: boolean;
  accessibilityLabel?: string | undefined;
  showIndicator?: boolean;
}) {
  return (
    <Tap
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className={`flex-1 flex-row items-center justify-center gap-2 rounded-[15px] border py-3 ${
        primary
          ? 'border-[rgba(212,197,163,.28)] bg-[rgba(212,197,163,.12)]'
          : 'border-line bg-[rgba(255,255,255,.035)]'
      }`}
      onPress={onPress}
    >
      {icon}
      <Text
        numberOfLines={1}
        className={`font-sans-semibold text-[12.5px] ${primary ? 'text-accent' : 'text-ink'}`}
      >
        {label}
      </Text>
      <View
        accessible={false}
        className="absolute right-2 h-1.5 w-1.5 rounded-full bg-accent"
        style={{ opacity: showIndicator ? 1 : 0 }}
      />
    </Tap>
  );
}
