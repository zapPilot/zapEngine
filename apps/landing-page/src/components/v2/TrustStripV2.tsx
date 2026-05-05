import { Activity, GitBranch, KeyRound, type LucideIcon } from 'lucide-react';
import { LINKS } from '@/config/links';
import { MESSAGES } from '@/config/messages';

const TRUST_ICONS = {
  Activity,
  GitBranch,
  KeyRound,
} satisfies Record<string, LucideIcon>;

export function TrustStripV2() {
  return (
    <section className="trust-strip" aria-label="Trust signals">
      <div className="trust-strip-inner">
        {MESSAGES.trustBadges.map((badge) => {
          const Icon = TRUST_ICONS[badge.icon];
          const content = (
            <>
              <Icon aria-hidden />
              <span>{badge.label}</span>
            </>
          );

          if ('linkType' in badge && badge.linkType === 'github') {
            return (
              <a
                className="trust-badge"
                href={LINKS.social.github}
                target="_blank"
                rel="noopener noreferrer"
                key={badge.label}
              >
                {content}
              </a>
            );
          }

          return (
            <span className="trust-badge" key={badge.label}>
              {content}
            </span>
          );
        })}
      </div>
    </section>
  );
}
