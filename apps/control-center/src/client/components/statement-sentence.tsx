import { Fragment, type ReactNode } from 'react';

import type { StatementSegment } from '../../shared/statements.js';

/** Turns a rule's sentence segments into JSX, colouring only the value the rule fired on. */
export function renderSentence(
  segments: readonly StatementSegment[],
): ReactNode {
  return segments.map((segment, index) =>
    'text' in segment ? (
      <Fragment key={index}>{segment.text}</Fragment>
    ) : (
      <span key={index} className={`seg-${segment.tone}`}>
        {segment.value}
      </span>
    ),
  );
}
