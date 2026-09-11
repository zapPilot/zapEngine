import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { toneClass, type Tone } from './tone.js';

/**
 * The one card shell every dashboard panel uses.
 *
 * Pages compose this instead of writing their own head markup. That is not a
 * style preference: `dup:check` runs jscpd at `threshold: 0` with `minLines: 5`
 * in strict mode, so two panels that each spell out an icon chip, a title and a
 * subtitle would be an identical five-line run and fail the gate.
 */
export function Card(props: {
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  icon?: LucideIcon;
  subtitle?: string;
  title: string;
  tone?: Tone;
}) {
  const Icon = props.icon;
  const classes = ['cc-card', toneClass(props.tone), props.className]
    .filter(Boolean)
    .join(' ');
  return (
    <section className={classes}>
      <header className="cc-card-head">
        {Icon ? (
          <span className="cc-icon-chip">
            <Icon aria-hidden="true" />
          </span>
        ) : null}
        <div className="cc-card-heading">
          <h2 className="cc-card-title">{props.title}</h2>
          {props.subtitle ? (
            <p className="cc-card-subtitle">{props.subtitle}</p>
          ) : null}
        </div>
        {props.action ? (
          <div className="cc-card-action">{props.action}</div>
        ) : null}
      </header>
      <div className="cc-card-body">{props.children}</div>
    </section>
  );
}
