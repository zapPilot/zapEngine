import type { ReactNode } from 'react';

import { toneClass, type Tone } from './tone.js';

/**
 * One headline number.
 *
 * `size` tops out well below the mockup's display numerals on purpose: real
 * values on this dashboard are routinely single digits, and a 40px "1" reads as
 * an unfinished placeholder rather than a measurement.
 */
export function Stat(props: {
  aside?: ReactNode;
  caption?: string;
  label: ReactNode;
  size?: 'lg' | 'md' | 'sm';
  tone?: Tone;
  value: string;
}) {
  const size = props.size ?? 'md';
  return (
    <div className={`cc-stat cc-stat-${size} ${toneClass(props.tone)}`}>
      <span className="cc-stat-label">{props.label}</span>
      <span className="cc-stat-row">
        <strong className="cc-stat-value">{props.value}</strong>
        {props.aside}
      </span>
      {props.caption ? (
        <span className="cc-stat-caption">{props.caption}</span>
      ) : null}
    </div>
  );
}
