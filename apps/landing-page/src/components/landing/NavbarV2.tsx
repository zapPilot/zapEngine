import Link from 'next/link';
import { LINKS } from '@/config/links';
import { BrandMark } from './BrandMark';

const NAV_ITEMS = [
  { href: '#strategy', label: 'Strategy' },
  { href: '#proof', label: 'Performance' },
  { href: '#protocols', label: 'Protocols' },
  { href: '/docs/', label: 'Docs' },
  { href: '/pitch/', label: 'Pitch' },
] as const;

export function NavbarV2() {
  return (
    <nav className="nav" aria-label="Zap Pilot v2 navigation">
      <Link className="brand" href="/" aria-label="Zap Pilot v2 home">
        <BrandMark />
      </Link>

      <div className="nav-links" aria-label="Page sections">
        {NAV_ITEMS.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </div>

      <div className="nav-actions">
        <a
          className="version-toggle"
          href={LINKS.app}
          target="_blank"
          rel="noopener noreferrer"
        >
          ← v1
        </a>
        <a
          className="nav-cta"
          href={LINKS.v2}
          target="_blank"
          rel="noopener noreferrer"
        >
          Launch App
        </a>
      </div>
    </nav>
  );
}
