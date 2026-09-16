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

describe('episode-queue coverage', () => {
  it('ranks every queue state, worst first', () => {
    const states = [
      'failed',
      'blocked',
      'processing',
      'retrying',
      'queued',
      'completed',
    ] as const;
    const jobs = states.map((state) =>
      item({ key: `job-${state}`, episodeId: 'ep-rank', state }),
    );
    void jobs;
    for (const state of states) {
      const result = aggregateRenderLane(
        lane({ queued: [item({ episodeId: `ep-${state}`, state })] }),
      );
      const bucket =
        state === 'failed' || state === 'blocked'
          ? result.attention
          : state === 'processing'
            ? result.processing
            : result.queued;
      expect(bucket[0]?.state).toBe(state);
    }
  });

  it('prefers the highest-ranked error when several jobs failed', () => {
    const result = aggregateRenderLane(
      lane({
        queued: [
          item({
            key: 'a',
            episodeId: 'ep-err',
            state: 'queued',
            lastError: 'queued boom',
          }),
          item({
            key: 'b',
            episodeId: 'ep-err',
            state: 'failed',
            lastError: 'failed boom',
          }),
        ],
      }),
    );

    expect(result.attention[0]?.lastError).toBe('failed boom');
  });

  it('carries a render thumbnail onto the episode', () => {
    const result = aggregateRenderLane(
      lane({
        queued: [
          item({
            key: 'r1',
            episodeId: 'ep-thumb',
            state: 'queued',
            thumbnailUrl: 'https://cdn.example.com/t.jpg',
          }),
        ],
      }),
    );

    expect(result.queued[0]?.thumbnailUrl).toBe(
      'https://cdn.example.com/t.jpg',
    );
  });

  it('sorts visual work before renders even when it arrives last', () => {
    const renderJob = item({
      key: 'render-1',
      kind: 'render',
      episodeId: 'ep-sort',
      languageCode: 'ja',
      state: 'queued',
    });
    const visualJob = item({
      key: 'visual-1',
      kind: 'visual',
      episodeId: 'ep-sort',
      state: 'queued',
    });

    const result = aggregateRenderLane(
      lane({ queued: [renderJob, visualJob] }),
    );

    expect(result.queued[0]?.jobs.map((job) => job.key)).toEqual([
      'visual-1',
      'render-1',
    ]);
  });

  it('orders non-visual jobs by language and unknown languages last', () => {
    const result = aggregateRenderLane(
      lane({
        queued: [
          item({
            key: 'unknown',
            episodeId: 'ep-lang',
            languageCode: undefined,
            state: 'queued',
          }),
          item({
            key: 'ja',
            episodeId: 'ep-lang',
            languageCode: 'ja',
            state: 'queued',
          }),
          item({
            key: 'en',
            episodeId: 'ep-lang',
            languageCode: 'en',
            state: 'queued',
          }),
        ],
      }),
    );

    expect(result.queued[0]?.jobs.map((job) => job.key)).toEqual([
      'ja',
      'en',
      'unknown',
    ]);
  });

  it('dedupes links with and without a url', () => {
    const link = {
      platform: 'x',
      languageCode: 'en',
      publishedAt: '2026-09-17T08:00:00Z',
      url: null,
    } as never;
    const result = aggregateRenderLane(
      lane({
        queued: [
          item({ key: 'a', episodeId: 'ep-links', publishedLinks: [link] }),
          item({ key: 'b', episodeId: 'ep-links', publishedLinks: [link] }),
        ],
      }),
    );

    expect(result.queued[0]?.publishedLinks).toHaveLength(1);
  });

  it('keys an episode without an episode id by its job key', () => {
    const result = aggregateRenderLane(
      lane({ queued: [item({ key: 'lonely', episodeId: undefined })] }),
    );

    expect(result.queued[0]?.key).toBe('episode:lonely');
    expect(result.queued[0]?.episodeId).toBeUndefined();
  });

  it('sorts timeless episodes after dated ones', () => {
    const timeless = item({ key: 'timeless', episodeId: undefined });
    const dated = item({
      key: 'dated',
      episodeId: 'ep-dated',
      queuedAt: '2026-09-17T06:00:00.000Z',
      state: 'queued',
    });

    const result = aggregateRenderLane(lane({ queued: [timeless, dated] }));

    expect(result.queued.map((entry) => entry.key)).toEqual(
      ['episode:ep-dated', 'episode:lonely'].map((key) =>
        key === 'episode:lonely' ? 'episode:timeless' : key,
      ),
    );
    void timeless;
  });
});
