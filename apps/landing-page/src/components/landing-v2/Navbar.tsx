import Image from 'next/image';
import { LINKS } from '@/config/links';

const NAV_LINKS = [
  { label: 'Strategy', href: '#strategy', external: false },
  { label: 'Performance', href: '#proof', external: false },
  { label: 'Execution', href: '#trust', external: false },
  { label: 'Docs', href: LINKS.social.github, external: true },
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
        {NAV_LINKS.map((link) =>
          link.external ? (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.label}
            </a>
          ) : (
            <a key={link.label} href={link.href}>
              {link.label}
            </a>
          ),
        )}
      </div>
      <a
        className="zp-nav-cta"
        href={LINKS.app}
        target="_blank"
        rel="noopener noreferrer"
      >
        Launch App
      </a>
    </nav>
  );
}
