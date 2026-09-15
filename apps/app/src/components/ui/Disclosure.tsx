import { ChevronDown } from 'lucide-react-native';
import type { ReactNode } from 'react';
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
        <ChevronDown
          size={chevronSize}
          color="#a1a1aa"
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      </Tap>
      {expanded ? children : null}
    </>
  );
}
