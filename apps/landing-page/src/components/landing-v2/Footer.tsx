import { BRAND_NAME } from '@zapengine/zap-pilot-story/brand';
import { StatusNote } from '@/components/StatusBadge';
import { LINKS } from '@/config/links';
import { MESSAGES } from '@/config/messages';

import { DiscordLink } from './DiscordLink';

export function Footer() {
  const { footer, trustBadges } = MESSAGES;
  return (
    <footer className="zp-footer">
      <div className="zp-footer-inner">
        <ul className="zp-footer-items">
          {trustBadges.map((badge) => (
            <li key={badge.label}>
              {'linkType' in badge ? (
                <a
                  href={LINKS.social.github}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {badge.label}
                </a>
              ) : (
                <StatusNote note={{ ...badge, text: badge.label }} />
              )}
            </li>
          ))}
        </ul>
        <nav className="zp-footer-items" aria-label={footer.socialLabel}>
          {[
            { label: footer.github, href: LINKS.social.github },
            { label: footer.x, href: LINKS.social.x },
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
          <DiscordLink location="footer">{footer.discord}</DiscordLink>
        </nav>
        <span className="zp-footer-brand">{BRAND_NAME}</span>
      </div>
    </footer>
  );
}
