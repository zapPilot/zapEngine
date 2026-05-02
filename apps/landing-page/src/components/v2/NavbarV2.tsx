/* eslint-disable @next/next/no-html-link-for-pages -- v1/v2 toggles intentionally use hard reloads so WebGL contexts fully tear down. */
import { LINKS } from '@/config/links';
import { MESSAGES } from '@/config/messages';

const NAV_ITEMS = [
  { href: '#strategy', label: 'Strategy' },
  { href: '#proof', label: 'Performance' },
  { href: '#protocols', label: 'Protocols' },
  { href: '/docs/', label: 'Docs' },
] as const;

export function NavbarV2() {
  return (
    <nav className="nav" aria-label="Zap Pilot v2 navigation">
      <a className="brand" href="/v2/" aria-label="Zap Pilot v2 home">
        <span className="brand-mark" aria-hidden />
        <span className="brand-name">
          {MESSAGES.common.brandName}
          <em>— allocator</em>
        </span>
      </a>

      <div className="nav-links" aria-label="Page sections">
        {NAV_ITEMS.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </div>

      <div className="nav-actions">
        <a className="version-toggle" href="/">
          ← v1
        </a>
        <a
          className="nav-cta"
          href={LINKS.app}
          target="_blank"
          rel="noopener noreferrer"
        >
          Launch App
        </a>
      </div>
    </nav>
  );
}
