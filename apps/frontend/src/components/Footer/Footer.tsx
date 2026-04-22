import {
  type LucideIcon,
  MessageCircle,
  MessageSquare,
  Send,
  X,
} from 'lucide-react';
import type { ComponentType, ReactElement, SVGProps } from 'react';

import { GithubIcon } from '@/components/icons/GithubIcon';

interface SocialLink {
  icon: LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  url: string;
}

const SOCIAL_LINKS: SocialLink[] = [
  { icon: X, label: 'X (Twitter)', url: 'https://x.com/zapPilot' },
  { icon: GithubIcon, label: 'GitHub', url: 'https://github.com/zapPilot' },
  {
    icon: MessageCircle,
    label: 'Discord',
    url: 'https://discord.gg/d3vXUtcFCJ',
  },
  {
    icon: MessageSquare,
    label: 'Farcaster',
    url: 'https://farcaster.xyz/david-chang',
  },
  {
    icon: Send,
    label: 'Telegram',
    url: 'https://t.me/zappilot',
  },
];

/**
 * Internal component: Renders social media links
 */
function SocialLinksSection(): ReactElement {
  return (
    <div className="flex items-center gap-6">
      {SOCIAL_LINKS.map((link) => (
        <a
          key={link.label}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Visit our ${link.label}`}
          className="text-gray-400 hover:text-white transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500 rounded"
        >
          <link.icon className="w-5 h-5" />
        </a>
      ))}
    </div>
  );
}

interface CopyrightTextProps {
  year: number;
}

/**
 * Internal component: Renders copyright text
 */
function CopyrightText({ year }: CopyrightTextProps): ReactElement {
  return (
    <p className="text-sm text-gray-500">
      © {year} Zap Pilot. All rights reserved.
    </p>
  );
}

interface FooterProps {
  className?: string;
  containerClassName?: string;
}

/** Footer styling constants */
const STYLES = {
  base: 'border-t border-gray-800 bg-gray-900',
  container: 'mx-auto px-4 py-6 lg:px-8',
  mobileLayout: 'flex flex-col items-center gap-4 md:hidden',
  desktopLayout: 'hidden md:flex items-center justify-between',
} as const;

export function Footer({
  className = '',
  containerClassName = 'max-w-7xl',
}: FooterProps): ReactElement {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`${STYLES.base} ${className}`}>
      <div className={`${containerClassName} ${STYLES.container}`}>
        {/* Mobile: stacked layout */}
        <div className="flex flex-col items-center gap-4 md:hidden">
          <SocialLinksSection />
          <CopyrightText year={currentYear} />
        </div>

        {/* Desktop: single row with space-between */}
        <div className="hidden md:flex items-center justify-between">
          <SocialLinksSection />
          <CopyrightText year={currentYear} />
        </div>
      </div>
    </footer>
  );
}
