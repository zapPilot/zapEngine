import { LINKS } from '@/config/links';
import { DiscordLink } from './DiscordLink';

export function Footer() {
  return (
    <footer className="zp-footer">
      <div className="zp-footer-inner">
        <div className="zp-footer-items">
          <span>100% self-custody · EOA</span>
          <span className="zp-footer-live">
            <span className="zp-dot zp-dot-sm" aria-hidden />
            Live on mainnet
          </span>
        </div>
        <nav className="zp-footer-items" aria-label="Social links">
          {[
            { label: 'GitHub', href: LINKS.social.github },
            { label: 'X', href: LINKS.social.x },
          ].map(({ label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {label}
            </a>
          ))}
          <DiscordLink location="footer">Discord community</DiscordLink>
        </nav>
        <span className="zp-footer-brand">Zap Pilot</span>
      </div>
    </footer>
  );
}
