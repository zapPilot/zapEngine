import { Fragment } from 'react';

import { StatusBadge } from '@/components/StatusBadge';
import { MESSAGES } from '@/config/messages';

import { DownloadCta } from './DownloadCta';
import { RuntimeTrace } from './RuntimeTrace';

export function Hero() {
  const { hero, common } = MESSAGES;
  return (
    <section id="overview" className="zp-hero" aria-labelledby="hero-title">
      <div>
        <div className="zp-eyebrow">{hero.eyebrow}</div>
        <h1 id="hero-title" className="zp-hero-title">
          {common.brandLineParts.map((part, index) => (
            <Fragment key={part}>
              {index > 0 ? <br /> : null}
              {part}
            </Fragment>
          ))}
        </h1>
        <p className="zp-hero-sub">{hero.subtitle}</p>
        <ul className="zp-hero-chips">
          {hero.chips.map((chip) => (
            <li key={chip.text} className="zp-chip">
              <StatusBadge capability={chip.capability} />
              {chip.text}
            </li>
          ))}
        </ul>
        <div
          className="zp-hero-ctas"
          id="waitlist"
          aria-label={hero.actionsLabel}
        >
          <DownloadCta />
          <a className="zp-btn zp-btn-ghost" href={hero.secondaryCta.href}>
            {hero.secondaryCta.label}
          </a>
        </div>
      </div>
      <RuntimeTrace />
    </section>
  );
}
