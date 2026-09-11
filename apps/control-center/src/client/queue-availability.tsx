import type { ReactNode } from 'react';

import type { PipelineQueuesResponse } from '../shared/pipeline-queues.js';
import { EmptyState } from './components/ui/EmptyState.js';

/**
 * Renders queue-derived content, or says why it cannot.
 *
 * "Not loaded yet" and "the read failed" look identical on screen unless they
 * are said out loud, and every queue panel needs that distinction. Taking the
 * children as a function means a panel receives a response that is already
 * known to be usable, so no page repeats the guard.
 */
export function QueuePanel(props: {
  children: (queues: PipelineQueuesResponse) => ReactNode;
  queues: PipelineQueuesResponse | null;
}) {
  if (!props.queues) {
    return <EmptyState detail="佇列尚未載入。" title="Loading queues" />;
  }
  if (props.queues.status !== 'ok') {
    return (
      <EmptyState
        detail={props.queues.message ?? '佇列讀取失敗。'}
        title="Queues unavailable"
      />
    );
  }
  return <>{props.children(props.queues)}</>;
}
