import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

interface ScreenHeaderProps {
  title: string;
  right?: ReactNode;
  className?: string;
}

/** Serif page title with an optional trailing action (tab screens). */
export function ScreenHeader({ title, right, className }: ScreenHeaderProps) {
  return (
    <div
      className={cn('flex items-center justify-between px-5 pt-2', className)}
    >
      <h1 className="font-serif text-[27px] leading-none text-ink">{title}</h1>
      {right}
    </div>
  );
}
