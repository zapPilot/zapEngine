import { ChevronDown } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Tap } from '@/components/ui/Tap';
export function Disclosure({
  expanded,
  onToggle,
  accessibilityLabel,
  header,
  className,
  chevronSize = 17,
  children,
}: {
  expanded: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  header: ReactNode;
  className?: string;
  chevronSize?: number;
  children?: ReactNode;
}) {
  return (
    <>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        className={className ?? 'flex-row items-center gap-3 py-3'}
        onPress={onToggle}
      >
        {header}
        {/* Rotate a wrapper: on web lucide forwards `style` to the inner path,
            which then spins around the viewBox origin and leaves the icon. */}
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
          <ChevronDown size={chevronSize} color="#a1a1aa" />
        </View>
      </Tap>
      {expanded ? children : null}
    </>
  );
}
