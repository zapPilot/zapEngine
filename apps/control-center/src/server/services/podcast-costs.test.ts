import { describe, expect, it } from 'vitest';

import { summarizePodcastCosts } from './podcast-costs.js';

describe('summarizePodcastCosts', () => {
  it('separates ingest/video cost and counts failed-run spend as retry waste', () => {
    const runs = [
      {
        id: 'ingest-ok',
        pipeline: 'ingest' as const,
        episode_id: 'episode-1',
        status: 'completed' as const,
        started_at: '2026-08-28T01:00:00.000Z',
      },
      {
        id: 'visual-failed',
        pipeline: 'video_render' as const,
        episode_id: 'episode-1',
        status: 'failed' as const,
        started_at: '2026-08-28T02:00:00.000Z',
      },
      {
        id: 'render-ok',
        pipeline: 'video_render' as const,
        episode_id: 'episode-1',
        status: 'completed' as const,
        started_at: '2026-08-28T03:00:00.000Z',
      },
    ];
    const videoStageBase = {
      run_id: 'render-ok' as const,
      episode_id: 'episode-1' as const,
      language_code: 'en' as const,
      stage: 'video_render' as const,
      status: 'completed' as const,
    };
    const stages = [
      {
        run_id: 'ingest-ok',
        episode_id: 'episode-1',
        language_code: 'ja',
        stage: 'narration',
        status: 'completed' as const,
        estimated_cost_usd: 0.3,
        pricing_basis: 'provider_reported' as const,
      },
      {
        run_id: 'visual-failed',
        episode_id: 'episode-1',
        language_code: null,
        stage: 'video_render',
        status: 'failed' as const,
        estimated_cost_usd: 0.1,
        pricing_basis: 'rate_card' as const,
      },
      {
        ...videoStageBase,
        estimated_cost_usd: 0.4,
        pricing_basis: 'rate_card' as const,
      },
      {
        ...videoStageBase,
        estimated_cost_usd: null,
        pricing_basis: 'unpriced' as const,
      },
    ];

    const [episode] = summarizePodcastCosts(
      runs,
      stages,
      new Map([['episode-1', 'Episode title']]),
    );

    expect(episode).toMatchObject({
      episodeId: 'episode-1',
      title: 'Episode title',
      totalCostUsd: 0.8,
      podcastCostUsd: 0.3,
      videoCostUsd: 0.5,
      retryWasteUsd: 0.1,
      runCount: 3,
      failedRuns: 1,
      unpricedStages: 1,
      lastRunAt: '2026-08-28T03:00:00.000Z',
    });
    expect(episode?.breakdown).toEqual([
      { label: 'en render', costUsd: 0.4, operations: 1 },
      { label: 'ja narration', costUsd: 0.3, operations: 1 },
      { label: 'Shared visual', costUsd: 0.1, operations: 1 },
    ]);
  });
});
