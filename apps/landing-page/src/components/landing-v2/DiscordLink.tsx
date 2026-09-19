'use client';

import type { ReactNode } from 'react';
import { LINKS } from '@/config/links';
import {
  trackDiscordCtaClicked,
  type DiscordCtaLocation,
} from '@/lib/analytics/events';

export function DiscordLink({
  location,
  postWaitlist = false,
  className,
  children,
}: {
  location: DiscordCtaLocation;
  postWaitlist?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={LINKS.social.discord}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => trackDiscordCtaClicked(location, postWaitlist)}
    >
      {children}
    </a>
  );
}
