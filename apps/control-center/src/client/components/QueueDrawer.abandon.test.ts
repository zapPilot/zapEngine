import { describe, expect, it } from 'vitest';

import type { PipelineQueueItem } from '../../shared/pipeline-queues.js';
import { canAbandon, type SelectedQueueEntry } from './QueueDrawer.js';

function item(overrides: Partial<PipelineQueueItem> = {}): PipelineQueueItem {
  return {
    key: 'render:localization-1',
    kind: 'render',
    episodeId: '826f4b87-6278-4275-bff5-535ba5ef438d',
    title: 'Old failed render',
    state: 'failed',
    retryCount: 2,
    history: [],
    publishedLinks: [],
    actions: {},
    ...overrides,
  };
}

function selected(
  entry: PipelineQueueItem,
  kind: SelectedQueueEntry['kind'] = 'render',
): SelectedQueueEntry {
  if (kind === 'social') {
    throw new Error('social fixture not needed by this test');
  }
  return { kind, item: entry };
}

describe('canAbandon', () => {
  it.each(['failed', 'blocked'] as const)(
    'offers abandon for %s render attention work',
    (state) => {
      expect(canAbandon(selected(item({ state })))).toBe(true);
    },
  );

  it.each(['processing', 'queued', 'retrying', 'completed'] as const)(
    'does not offer abandon for %s work',
    (state) => {
      expect(canAbandon(selected(item({ state })))).toBe(false);
    },
  );

  it('does not offer abandon for ingest or already-abandoned work', () => {
    expect(canAbandon(selected(item(), 'api'))).toBe(false);
    expect(
      canAbandon(
        selected(
          item({
            abandoned: {
              at: '2026-09-06T00:00:00.000Z',
              reason: 'operator dismissed',
            },
          }),
        ),
      ),
    ).toBe(false);
  });
});
