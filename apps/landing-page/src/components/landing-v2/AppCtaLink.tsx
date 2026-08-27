'use client';

import type { ReactNode } from 'react';

import { trackCtaClicked, type CtaLocation } from '@/lib/analytics/events';
import { LINKS } from '@/config/links';

/**
 * The "open the app" anchor, wherever it appears on the marketing site.
 *
 * Its sections (Hero, Navbar, ClosingCta) are server components, so the click
 * handler needs its own client boundary rather than a `'use client'` on each
 * whole section.
 */
export function AppCtaLink({
  location,
  className,
  children,
}: {
  location: CtaLocation;
  className: string;
  children: ReactNode;
}) {
  return (
    <a
      className={className}
      href={LINKS.app}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackCtaClicked(location)}
    >
      {children}
    </a>
  );
}
