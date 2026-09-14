import { describe, expect, it } from 'vitest';

import { summarizePodcastCosts } from './podcast-costs.js';

describe('summarizePodcastCosts', () => {
  it('keeps failed-parent spend separate from confirmed retry waste', () => {
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
        execution_id: null,
        previous_execution_id: null,
        work_key: null,
        execution_mode: null,
        failure_reason: null,
      },
      {
        run_id: 'render-ok',
        episode_id: 'episode-1',
        language_code: 'en',
        stage: 'video_render',
        status: 'completed' as const,
        estimated_cost_usd: 0.4,
        pricing_basis: 'rate_card' as const,
        execution_id: null,
        previous_execution_id: null,
        work_key: null,
        execution_mode: null,
        failure_reason: null,
      },
      {
        run_id: 'render-ok',
        episode_id: 'episode-1',
        language_code: 'en',
        stage: 'video_render',
        status: 'completed' as const,
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
      failedAttemptCostUsd: 0.1,
      confirmedRetryWasteUsd: null,
      confirmedRetryWasteIsLowerBound: true,
      interruptedAttemptCostUsd: null,
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

  it('publishes the evidence fields and nothing else', () => {
    const runs = [
      {
        id: 'ingest-ok',
        pipeline: 'ingest' as const,
        episode_id: 'episode-1',
        status: 'completed' as const,
        started_at: '2026-08-28T01:00:00.000Z',
      },
    ];
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
    ];

    const [episode] = summarizePodcastCosts(runs, stages, new Map());

    // The alias is gone rather than deprecated: a caller still reading it would
    // keep presenting failed-parent spend as proven retry waste.
    expect(episode).not.toHaveProperty('retryWasteUsd');
    // @ts-expect-error retryWasteUsd is no longer part of the public contract.
    expect(episode?.retryWasteUsd).toBeUndefined();
    expect(Object.keys(episode ?? {}).sort()).toEqual([
      'breakdown',
      'confirmedDeploymentInterruptionCostUsd',
      'confirmedRetryWasteIsLowerBound',
      'confirmedRetryWasteUsd',
      'episodeId',
      'failedAttemptCostUsd',
      'failedRuns',
      'interruptedAttemptCostUsd',
      'lastRunAt',
      'podcastCostUsd',
      'runCount',
      'shutdownInterruptionCostUsd',
      'title',
      'totalCostUsd',
      'unknownFailureReasonStages',
      'unknownLineageStages',
      'unpricedStages',
      'videoCostUsd',
    ]);
  });

  it('counts an earlier execution once when an exact-work successor reruns it', () => {
    const runs = [
      {
        id: 'failed-1',
        pipeline: 'video_render' as const,
        episode_id: 'episode-1',
        status: 'failed' as const,
        started_at: '2026-09-09T01:00:00.000Z',
      },
      {
        id: 'success-2',
        pipeline: 'video_render' as const,
        episode_id: 'episode-1',
        status: 'completed' as const,
        started_at: '2026-09-09T02:00:00.000Z',
      },
    ];
    const stages = [
      {
        run_id: 'failed-1',
        episode_id: 'episode-1',
        language_code: 'en',
        stage: 'video_render',
        status: 'failed' as const,
        estimated_cost_usd: '0.02473288',
        pricing_basis: 'rate_card' as const,
        execution_id: 'exec-1',
        previous_execution_id: null,
        work_key: 'video_render:loc:v3:hash',
        execution_mode: 'executed' as const,
        failure_reason: 'deploy_shutdown',
        deployment_id: 'deployment-1',
      },
      {
        run_id: 'success-2',
        episode_id: 'episode-1',
        language_code: 'en',
        stage: 'video_render',
        status: 'completed' as const,
        estimated_cost_usd: '0.03000000',
        pricing_basis: 'rate_card' as const,
        execution_id: 'exec-2',
        previous_execution_id: 'exec-1',
        work_key: 'video_render:loc:v3:hash',
        execution_mode: 'executed' as const,
        failure_reason: null,
        deployment_id: null,
      },
    ];

    const [episode] = summarizePodcastCosts(
      runs,
      stages,
      new Map([['episode-1', null]]),
    );

    expect(episode).toMatchObject({
      failedAttemptCostUsd: 0.02473288,
      interruptedAttemptCostUsd: 0.02473288,
      confirmedDeploymentInterruptionCostUsd: 0.02473288,
      shutdownInterruptionCostUsd: 0,
      confirmedRetryWasteUsd: 0.02473288,
      confirmedRetryWasteIsLowerBound: false,
      unknownLineageStages: 0,
      unknownFailureReasonStages: 0,
    });
  });

  it('separates a plain shutdown from a deploy shutdown', () => {
    const runs = [
      {
        id: 'failed-1',
        pipeline: 'video_render' as const,
        episode_id: 'episode-1',
        status: 'failed' as const,
        started_at: '2026-09-09T01:00:00.000Z',
      },
    ];
    const stages = [
      {
        run_id: 'failed-1',
        episode_id: 'episode-1',
        language_code: 'en',
        stage: 'video_render',
        status: 'failed' as const,
        estimated_cost_usd: '0.05000000',
        pricing_basis: 'rate_card' as const,
        execution_id: 'exec-1',
        previous_execution_id: null,
        work_key: 'video_render:loc:v3:hash',
        execution_mode: 'executed' as const,
        failure_reason: 'shutdown',
        deployment_id: null,
      },
    ];

    const [episode] = summarizePodcastCosts(
      runs,
      stages,
      new Map([['episode-1', null]]),
    );

    expect(episode).toMatchObject({
      interruptedAttemptCostUsd: 0.05,
      confirmedDeploymentInterruptionCostUsd: 0,
      shutdownInterruptionCostUsd: 0.05,
    });
  });

  it('claims $0 interrupted only once every failed stage carries a reason', () => {
    const runs = [
      {
        id: 'failed-1',
        pipeline: 'video_render' as const,
        episode_id: 'episode-1',
        status: 'failed' as const,
        started_at: '2026-09-09T01:00:00.000Z',
      },
    ];
    const reasoned = {
      run_id: 'failed-1',
      episode_id: 'episode-1',
      language_code: 'en',
      stage: 'video_render',
      status: 'failed' as const,
      estimated_cost_usd: '0.05000000',
      pricing_basis: 'rate_card' as const,
      execution_id: 'exec-1',
      previous_execution_id: null,
      work_key: 'video_render:loc:v3:hash',
      execution_mode: 'executed' as const,
      failure_reason: 'render_timeout',
      deployment_id: null,
    };

    const [withReason] = summarizePodcastCosts(
      runs,
      [reasoned],
      new Map([['episode-1', null]]),
    );
    expect(withReason).toMatchObject({
      interruptedAttemptCostUsd: 0,
      unknownFailureReasonStages: 0,
    });

    const [withoutReason] = summarizePodcastCosts(
      runs,
      [{ ...reasoned, failure_reason: null }],
      new Map([['episode-1', null]]),
    );
    expect(withoutReason).toMatchObject({
      interruptedAttemptCostUsd: null,
      unknownFailureReasonStages: 1,
    });
  });
});
