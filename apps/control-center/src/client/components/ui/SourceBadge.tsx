import type { CSSProperties } from 'react';

import type { OperationsSource } from '../../../shared/types.js';
import { sourceLabel } from '../../operator-model.js';
import { sourceColorVar } from './tone.js';

/**
 * Which system a number came from.
 *
 * This is load-bearing on a dashboard that fans in eight providers with
 * different freshness and different failure modes: "GitHub Actions says the job
 * failed" and "Supabase says the queue is deep" are not interchangeable claims.
 */
export function SourceBadge(props: { source: OperationsSource }) {
  const style = { '--cc-src': sourceColorVar(props.source) } as CSSProperties;
  return (
    <span className="cc-src" style={style}>
      <i aria-hidden="true" className="cc-src-dot" />
      {sourceLabel(props.source)}
    </span>
  );
}
