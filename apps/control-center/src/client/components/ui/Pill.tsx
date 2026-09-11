import type { ReactNode } from 'react';

import type { OperationalStatus } from '../../../shared/types.js';
import { statusText } from '../../operator-model.js';
import { statusTone, toneClass, type Tone } from './tone.js';

export function Pill(props: {
  children: ReactNode;
  dot?: boolean;
  tone: Tone;
  variant?: 'outline' | 'soft' | 'solid';
}) {
  const variant = props.variant ?? 'soft';
  return (
    <span className={`cc-pill cc-pill-${variant} ${toneClass(props.tone)}`}>
      {props.dot ? <i aria-hidden="true" className="cc-pill-dot" /> : null}
      {props.children}
    </span>
  );
}

/** Health as a word, not only a colour: the tone repeats what the text says so
 * the badge still reads correctly in greyscale or with colour vision deficiency. */
export function StatusPill(props: { status: OperationalStatus | undefined }) {
  return (
    <Pill dot tone={statusTone(props.status)}>
      {statusText(props.status)}
    </Pill>
  );
}
