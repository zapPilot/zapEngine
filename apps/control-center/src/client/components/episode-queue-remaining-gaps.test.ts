import { describe, expect, it } from 'vitest';

import type {
  PipelineQueueItem,
  PipelineQueueLane,
  PipelineQueueState,
} from '../../shared/pipeline-queues.js';
import { aggregateRenderLane } from './episode-queue.js';

function item(
  key: string,
  state: PipelineQueueState,
  overrides: Partial<PipelineQueueItem> = {},
): PipelineQueueItem {
  return {
    key,
    episodeId: 'episode-rank',
    kind: 'render',
    title: 'Ranked episode',
    state,
    retryCount: 0,
    history: [],
    publishedLinks: [],
    actions: {},
    ...overrides,
  };
}

function lane(
  items: PipelineQueueItem[],
): PipelineQueueLane<PipelineQueueItem> {
  return {
    processing: [],
    queued: items,
    attention: [],
  };
}

describe('coverage handoff: remaining episode queue branches', () => {
  it.each([
    ['blocked', 'blocked'],
    ['processing', 'processing'],
    ['retrying', 'retrying'],
  ] as const)(
    'ranks %s above completed work in the same episode',
    (state, expected) => {
      const result = aggregateRenderLane(
        lane([item(`job-${state}`, state), item('job-completed', 'completed')]),
      );
      const grouped = [
        ...result.processing,
        ...result.queued,
        ...result.attention,
      ];
      expect(grouped).toHaveLength(1);
      expect(grouped[0]?.state).toBe(expected);
    },
  );

  it('keeps a known state ahead of an unexpected provider state', () => {
    const unexpected = {
      ...item('job-future', 'queued'),
      state: 'future-provider-state',
    } as unknown as PipelineQueueItem;

    const result = aggregateRenderLane(
      lane([unexpected, item('job-completed', 'completed')]),
    );

    expect(result.queued).toHaveLength(1);
    expect(result.queued[0]?.state).toBe('completed');
  });

  it('sorts distinct history entries chronologically and retains details', () => {
    const result = aggregateRenderLane(
      lane([
        item('job-history', 'queued', {
          history: [
            {
              at: '2026-09-18T09:00:00.000Z',
              label: 'rendered',
              detail: 'finished',
            },
            {
              at: '2026-09-18T08:00:00.000Z',
              label: 'claimed',
              detail: 'worker-1',
            },
          ],
        }),
      ]),
    );

    expect(result.queued[0]?.history).toEqual([
      {
        at: '2026-09-18T08:00:00.000Z',
        label: 'claimed',
        detail: 'worker-1',
      },
      {
        at: '2026-09-18T09:00:00.000Z',
        label: 'rendered',
        detail: 'finished',
      },
    ]);
  });
});
