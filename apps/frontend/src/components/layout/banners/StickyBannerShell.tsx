import type { PropsWithChildren } from 'react';

import { BaseCard } from '@/components/ui';
import { HEADER, Z_INDEX } from '@/constants/design-system';
import { cn } from '@/lib/ui/classNames';

interface StickyBannerShellProps {
  cardClassName?: string;
  'data-testid'?: string;
}

const BASE_CARD_CLASSES =
  'border-indigo-500/30 bg-indigo-950/40 px-4 py-3 text-indigo-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3';

export function StickyBannerShell({
  children,
  cardClassName,
  'data-testid': dataTestId,
}: PropsWithChildren<StickyBannerShellProps>) {
  const mergedCardClasses = cn(BASE_CARD_CLASSES, cardClassName);

  return (
    <div
      className={`sticky ${HEADER.TOP_OFFSET} ${Z_INDEX.BANNER} mx-4 lg:mx-8 mt-4`}
      data-testid={dataTestId}
    >
      <BaseCard
        variant="glass"
        padding="sm"
        borderRadius="md"
        className={mergedCardClasses}
      >
        {children}
      </BaseCard>
    </div>
  );
}
