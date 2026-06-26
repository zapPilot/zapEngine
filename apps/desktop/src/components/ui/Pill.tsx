import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface PillProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Small rounded label/tag used for statuses and chain chips. */
export function Pill({ children, className, style }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}
