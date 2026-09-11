import type { OperationalPriority } from '../shared/types.js';
import { ProviderLink } from './components/ui/Links.js';
import type { RankedItem } from './components/ui/RankedList.js';
import { SourceBadge } from './components/ui/SourceBadge.js';
import { statusTone } from './components/ui/tone.js';
import { relativeTime } from './format.js';

/**
 * Ranked signals as list items.
 *
 * Today and Reliability both render this shape, differing only in how much of
 * each signal they show. One mapper rather than two near-identical ones is not
 * only tidier — `dup:check` runs jscpd at `threshold: 0`, and two copies of
 * this map body is exactly the clone it rejects.
 */
export function priorityItems(
  priorities: OperationalPriority[],
  options: { detail?: boolean; sourceLink?: boolean } = {},
): RankedItem[] {
  return priorities.map((priority) => {
    const { signal } = priority;
    return {
      aside: options.sourceLink ? (
        <ProviderLink label="Source" title={signal.title} url={signal.url} />
      ) : undefined,
      detail: options.detail ? signal.detail : undefined,
      id: signal.fingerprint,
      meta: (
        <>
          <SourceBadge source={signal.source} />
          <span>{relativeTime(signal.observedAt)}</span>
        </>
      ),
      title: signal.title,
      tone: statusTone(signal.status),
    };
  });
}
