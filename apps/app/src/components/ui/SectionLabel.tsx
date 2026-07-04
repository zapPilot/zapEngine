import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { cn } from '@/lib/cn';

/** Mono uppercase micro-label used above sections. */
export function SectionLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Text
      className={cn(
        'font-mono text-[9.5px] uppercase tracking-[1.14px] text-ink-faint',
        className,
      )}
    >
      {children}
    </Text>
  );
}
