import { StatusNote } from '@/components/StatusBadge';
import { MESSAGES } from '@/config/messages';

import { AppCtaLink } from './AppCtaLink';
import { DiscordLink } from './DiscordLink';

// Desire: Belonging.
export function ClosingCta() {
  const { closing } = MESSAGES;
  return (
    <section
      id="closing"
      className="zp-section"
      aria-labelledby="closing-title"
    >
      <div className="zp-closing">
        <p id="closing-title" className="zp-closing-quote">
          {closing.quote}
        </p>
        <ul className="zp-closing-lines">
          {closing.lines.map((line) => (
            <li key={line.text}>
              <StatusNote note={line} />
            </li>
          ))}
        </ul>
        <div className="zp-closing-ctas">
          <AppCtaLink className="zp-btn zp-btn-primary" location="closing">
            {closing.primaryCta} <span aria-hidden>→</span>
          </AppCtaLink>
          <DiscordLink className="zp-btn zp-btn-ghost" location="closing">
            {closing.secondaryCta}
          </DiscordLink>
        </div>
      </div>
    </section>
  );
}
