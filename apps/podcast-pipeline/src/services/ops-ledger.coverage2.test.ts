import { describe, expect, it } from 'vitest';

import { videoRenderRunBase } from './ops-ledger.js';

describe('videoRenderRunBase coverage', () => {
  it('defaults finishedAt and episodeId when omitted', () => {
    const startedAt = new Date('2026-09-01T00:00:00.000Z');
    const base = videoRenderRunBase({
      runRef: 'abc123',
      status: 'completed',
      startedAt,
    });

    expect(base.runRef).toBe('abc123');
    expect(base.pipeline).toBe('video_render');
    expect(base.trigger).toBe('worker');
    expect(base.episodeId).toBeNull();
    expect(base.finishedAt.getTime()).toBeGreaterThanOrEqual(
      startedAt.getTime(),
    );
    expect(base.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('keeps an explicit finishedAt and episodeId', () => {
    const startedAt = new Date('2026-09-01T00:00:00.000Z');
    const finishedAt = new Date('2026-09-01T00:05:00.000Z');
    const base = videoRenderRunBase({
      runRef: 'abc123',
      status: 'failed',
      startedAt,
      finishedAt,
      episodeId: 'episode-1',
    });

    expect(base.finishedAt).toBe(finishedAt);
    expect(base.episodeId).toBe('episode-1');
    expect(base.status).toBe('failed');
  });
});
