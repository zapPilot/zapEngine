import { describe, expect, it } from 'vitest';

import type {
  PipelineQueueItem,
  PipelineQueueLane,
} from '../../shared/pipeline-queues.js';
import { aggregateRenderLane } from './episode-queue.js';

function item(overrides: Partial<PipelineQueueItem>): PipelineQueueItem {
  return {
    key: 'job-1',
    kind: 'render',
    title: 'Episode one',
    state: 'queued',
    retryCount: 0,
    history: [],
    publishedLinks: [],
    actions: {},
    ...overrides,
  };
}

function lane(
  overrides: Partial<PipelineQueueLane<PipelineQueueItem>> = {},
): PipelineQueueLane<PipelineQueueItem> {
  return { processing: [], queued: [], attention: [], ...overrides };
}

describe('aggregateRenderLane', () => {
  it('groups one episode’s jobs and keeps the worst state', () => {
    const visual = item({
      key: 'visual-1',
      kind: 'visual',
      episodeId: 'ep-1',
      state: 'completed',
      queuedAt: '2026-09-17T06:00:00.000Z',
    });
    const render = item({
      key: 'render-1',
      kind: 'render',
      episodeId: 'ep-1',
      languageCode: 'ja',
      state: 'failed',
      lastError: 'boom',
      queuedAt: '2026-09-17T07:00:00.000Z',
      updatedAt: '2026-09-17T07:30:00.000Z',
    });

    const result = aggregateRenderLane(lane({ queued: [visual, render] }));

    expect(result.queued).toHaveLength(0);
    expect(result.attention).toHaveLength(1);
    const grouped = result.attention[0]!;
    expect(grouped.key).toBe('episode:ep-1');
    expect(grouped.state).toBe('failed');
    expect(grouped.lastError).toBe('boom');
    expect(grouped.visual?.key).toBe('visual-1');
    expect(grouped.renders.map((job) => job.key)).toEqual(['render-1']);
    expect(grouped.queuedAt).toBe('2026-09-17T06:00:00.000Z');
    expect(grouped.updatedAt).toBe('2026-09-17T07:30:00.000Z');
  });

  it('keeps processing work in the processing lane', () => {
    const running = item({
      key: 'run-1',
      episodeId: 'ep-2',
      state: 'processing',
    });
    const waiting = item({ key: 'wait-1', episodeId: 'ep-3', state: 'queued' });

    const result = aggregateRenderLane(
      lane({ processing: [running], queued: [waiting] }),
    );

    expect(result.processing.map((entry) => entry.key)).toEqual([
      'episode:ep-2',
    ]);
    expect(result.queued.map((entry) => entry.key)).toEqual(['episode:ep-3']);
    expect(result.attention).toHaveLength(0);
  });

  it('dedupes repeated history and links across an episode’s jobs', () => {
    const history = [{ at: '2026-09-17T07:00:00Z', label: 'claimed' }];
    const links = [
      {
        platform: 'x',
        languageCode: 'ja',
        publishedAt: '2026-09-17T08:00:00Z',
        url: 'https://x.example/1',
      },
    ] as never;
    const first = item({
      key: 'a',
      episodeId: 'ep-4',
      state: 'completed',
      history,
      publishedLinks: links,
    });
    const second = item({
      key: 'b',
      episodeId: 'ep-4',
      state: 'completed',
      history,
      publishedLinks: links,
    });

    const result = aggregateRenderLane(lane({ queued: [first, second] }));

    expect(result.queued).toHaveLength(1);
    expect(result.queued[0]!.history).toHaveLength(1);
    expect(result.queued[0]!.publishedLinks).toHaveLength(1);
  });

  it('sorts episodes by earliest queued time', () => {
    const late = item({
      key: 'late',
      state: 'queued',
      queuedAt: '2026-09-17T09:00:00.000Z',
    });
    const early = item({
      key: 'early',
      state: 'queued',
      queuedAt: '2026-09-17T06:00:00.000Z',
    });

    const result = aggregateRenderLane(lane({ queued: [late, early] }));

    expect(result.queued.map((entry) => entry.key)).toEqual([
      'episode:early',
      'episode:late',
    ]);
  });
});
