import Link from 'next/link';

import { AppCtaLink } from '@/components/landing-v2/AppCtaLink';

const NAV_LINKS = [
  { label: 'Product', href: '/' },
  { label: 'Track record', href: '/track-record' },
  { label: 'Docs', href: '/docs' },
] as const;

export function DistributionNav() {
  return (
    <nav className="dist-nav" aria-label="Primary">
      <p className="dist-nav-brand">
        Zap Pilot
        <span>distribution engine</span>
      </p>
      <div className="dist-nav-links">
        {NAV_LINKS.map((link) => (
          <Link key={link.label} href={link.href}>
            {link.label}
          </Link>
        ))}
      </div>
      <AppCtaLink className="zp-nav-cta" location="navbar">
        Launch App
      </AppCtaLink>
    </nav>
  );
}
