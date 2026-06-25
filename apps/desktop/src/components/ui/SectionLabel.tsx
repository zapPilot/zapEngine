import type { ReactNode } from 'react';

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
    <div
      className={cn(
        'font-mono text-[9.5px] uppercase tracking-[.12em] text-ink-faint',
        className,
      )}
    >
      {children}
    </div>
  );
}
