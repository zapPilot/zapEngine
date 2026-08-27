import Image from 'next/image';

import { AppCtaLink } from './AppCtaLink';

const NAV_LINKS = [
  { label: 'Strategy', href: '#strategy' },
  { label: 'Performance', href: '#proof' },
  { label: 'Track Record', href: '/track-record' },
  { label: 'Execution', href: '#trust' },
  { label: 'Docs', href: '/docs' },
] as const;

export function Navbar() {
  return (
    <nav className="zp-nav" aria-label="Primary">
      <div className="zp-nav-brand">
        <Image
          src="/zap-pilot-icon.svg"
          alt="Zap Pilot"
          width={26}
          height={26}
        />
        <span className="zp-nav-name">Zap Pilot</span>
        <span className="zp-nav-tagline">— rules engine</span>
      </div>
      <div className="zp-nav-links">
        {NAV_LINKS.map((link) => (
          <a key={link.label} href={link.href}>
            {link.label}
          </a>
        ))}
      </div>
      <AppCtaLink className="zp-nav-cta" location="navbar">
        Launch App
      </AppCtaLink>
    </nav>
  );
}
