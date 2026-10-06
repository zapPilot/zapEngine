import Image from 'next/image';

import { MESSAGES } from '@/config/messages';

import { AppCtaLink } from './AppCtaLink';

export function Navbar() {
  const { nav, common } = MESSAGES;
  return (
    <nav className="zp-nav" aria-label={nav.ariaLabel}>
      <div className="zp-nav-brand">
        <Image
          src="/zap-pilot-icon.svg"
          alt={common.brandName}
          width={26}
          height={26}
        />
        <span className="zp-nav-name">{common.brandName}</span>
        <span className="zp-nav-tagline">— {common.tagline}</span>
      </div>
      <div className="zp-nav-links">
        {nav.links.map((link) => (
          <a key={link.label} href={link.href}>
            {link.label}
          </a>
        ))}
      </div>
      <AppCtaLink className="zp-nav-cta" location="navbar">
        {nav.cta}
      </AppCtaLink>
    </nav>
  );
}
