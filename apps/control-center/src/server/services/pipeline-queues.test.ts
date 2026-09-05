import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { describe, expect, it } from 'vitest';

import type { SocialPlatformQueueState } from '../../shared/pipeline-queues.js';
import { buildPipelineQueues, deriveSocialState } from './pipeline-queues.js';

const NOW = new Date('2026-09-05T06:00:00.000Z');
const EPISODE_A = '11111111-1111-4111-8111-111111111111';
const EPISODE_B = '22222222-2222-4222-8222-222222222222';
const EPISODE_C = '33333333-3333-4333-8333-333333333333';
const LOCALIZATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const LOCALIZATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

type QueueBuildInput = Parameters<typeof buildPipelineQueues>[0];

function baseInput(): QueueBuildInput {
  return {
    generatedAt: NOW.toISOString(),
    now: NOW,
    episodes: [
      {
        id: EPISODE_A,
        source_title: 'Episode A',
        source_url: 'https://example.com/a',
        created_at: '2026-09-05T03:00:00.000Z',
      },
      {
        id: EPISODE_B,
        source_title: 'Episode B',
        source_url: 'https://example.com/b',
        created_at: '2026-09-05T03:10:00.000Z',
      },
      {
        id: EPISODE_C,
        source_title: 'Episode C',
        source_url: 'https://example.com/c',
        created_at: '2026-09-05T03:20:00.000Z',
      },
    ],
    localizations: [
      {
        id: LOCALIZATION_A,
        episode_id: EPISODE_A,
        language_code: 'zh-Hant',
        script: 'script',
        hls_url: 'https://cdn.example/a.m3u8',
        classroom_hls_url: 'https://cdn.example/a-classroom.m3u8',
        status: 'completed',
        updated_at: '2026-09-05T04:00:00.000Z',
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        episode_id: EPISODE_A,
        language_code: 'ja',
        script: 'script',
        hls_url: 'https://cdn.example/a-ja.m3u8',
        classroom_hls_url: null,
        status: 'completed',
        updated_at: '2026-09-05T04:00:00.000Z',
      },
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        episode_id: EPISODE_A,
        language_code: 'en',
        script: 'script',
        hls_url: 'https://cdn.example/a-en.m3u8',
        classroom_hls_url: null,
        status: 'completed',
        updated_at: '2026-09-05T04:00:00.000Z',
      },
      {
        id: LOCALIZATION_B,
        episode_id: EPISODE_B,
        language_code: 'en',
        script: 'script',
        hls_url: 'https://cdn.example/b.m3u8',
        classroom_hls_url: null,
        status: 'completed',
        updated_at: '2026-09-05T04:00:00.000Z',
      },
    ],
    visualStates: [],
    ingests: [],
    visuals: [],
    renders: [],
    socialJobs: [],
    socialPosts: [],
    publishedToday: 0,
  };
}

type QueueRenderRow = QueueBuildInput['renders'][number];
type QueueVisualRow = QueueBuildInput['visuals'][number];
type QueueVisualStateRow = QueueBuildInput['visualStates'][number];
type QueueIngestRow = QueueBuildInput['ingests'][number];

function renderRow(overrides: Partial<QueueRenderRow> = {}): QueueRenderRow {
  return {
    episode_localization_id: LOCALIZATION_A,
    episode_id: EPISODE_A,
    status: 'failed',
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    progress_percent: null,
    progress_stage: 'Rendering',
    attempt_count: 3,
    next_attempt_at: '2026-09-05T04:00:00.000Z',
    lease_owner: null,
    lease_expires_at: null,
    last_error: 'Raster resvg stage failed',
    started_at: '2026-09-05T04:10:00.000Z',
    completed_at: null,
    thumbnail_url: null,
    created_at: '2026-09-05T04:00:00.000Z',
    updated_at: '2026-09-05T04:30:00.000Z',
    ...overrides,
  };
}

function visualRow(overrides: Partial<QueueVisualRow> = {}): QueueVisualRow {
  return {
    episode_id: EPISODE_A,
    status: 'failed',
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    progress_percent: null,
    progress_stage: 'planning-scenes',
    attempt_count: 3,
    next_attempt_at: '2026-09-05T04:00:00.000Z',
    lease_owner: null,
    lease_expires_at: null,
    last_error: 'Visual planning failed',
    started_at: null,
    completed_at: null,
    created_at: '2026-09-05T04:00:00.000Z',
    updated_at: '2026-09-05T04:30:00.000Z',
    ...overrides,
  };
}

function visualState(
  overrides: Partial<QueueVisualStateRow> = {},
): QueueVisualStateRow {
  return {
    episode_id: EPISODE_A,
    status: 'completed',
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    abandoned_at: null,
    abandoned_reason: null,
    ...overrides,
  };
}

function ingestRow(overrides: Partial<QueueIngestRow> = {}): QueueIngestRow {
  return {
    id: 'ingest-1',
    source_url: 'https://example.com/a',
    language_code: 'zh-Hant',
    status: 'failed',
    attempt_count: 2,
    lease_owner: null,
    lease_expires_at: null,
    last_error: 'TTS provider timeout',
    created_at: '2026-09-05T04:00:00.000Z',
    updated_at: '2026-09-05T04:30:00.000Z',
    ...overrides,
  };
}

function socialLane(
  status: SocialPlatformQueueState['status'],
  platform: SocialPlatformQueueState['platform'] = 'x',
): SocialPlatformQueueState {
  return {
    platform,
    languageCode: 'en',
    status,
    scheduledAt: '2026-09-05T05:00:00.000Z',
    retryCount: 0,
  };
}

describe('pipeline runtime queue read model', () => {
  it('only calls an ingest job processing when it has a live lease', () => {
    const input = baseInput();
    input.ingests = [
      {
        id: 'ingest-a',
        source_url: 'https://example.com/a',
        language_code: 'zh-Hant',
        status: 'processing',
        attempt_count: 1,
        lease_owner: 'f2c-api-01',
        lease_expires_at: '2026-09-05T06:05:00.000Z',
        last_error: null,
        created_at: '2026-09-05T04:00:00.000Z',
        updated_at: '2026-09-05T05:59:00.000Z',
      },
      {
        id: 'ingest-b',
        source_url: 'https://example.com/b',
        language_code: 'en',
        status: 'processing',
        attempt_count: 2,
        lease_owner: 'old-worker',
        lease_expires_at: '2026-09-05T05:59:00.000Z',
        last_error: 'lease expired',
        created_at: '2026-09-05T04:05:00.000Z',
        updated_at: '2026-09-05T05:59:00.000Z',
      },
    ];

    const queues = buildPipelineQueues(input);

    expect(queues.api.processing).toHaveLength(1);
    expect(queues.api.processing[0]).toMatchObject({
      episodeId: EPISODE_A,
      state: 'processing',
      workerId: 'f2c-api-01',
      currentStep: 'Finalization',
    });
    expect(queues.api.processing[0]).not.toHaveProperty('progressPercent');
    expect(queues.api.queued[0]).toMatchObject({
      episodeId: EPISODE_B,
      state: 'retrying',
      retryCount: 1,
    });
    expect(queues.api.queued[0]).not.toHaveProperty('workerId');
  });

  it('uses the real render lease and mirrors next_attempt_at queue ordering', () => {
    const input = baseInput();
    input.renders = [
      {
        episode_localization_id: LOCALIZATION_A,
        episode_id: EPISODE_A,
        status: 'processing',
        visual_version: null,
        progress_percent: 73,
        progress_stage: 'encoding',
        attempt_count: 1,
        next_attempt_at: '2026-09-05T04:00:00.000Z',
        lease_owner: 'render-machine-a',
        lease_expires_at: '2026-09-05T06:05:00.000Z',
        last_error: null,
        started_at: '2026-09-05T05:40:00.000Z',
        completed_at: null,
        thumbnail_url: 'https://cdn.example/thumb.jpg',
        created_at: '2026-09-05T04:00:00.000Z',
        updated_at: '2026-09-05T05:59:00.000Z',
      },
      {
        episode_localization_id: LOCALIZATION_B,
        episode_id: EPISODE_B,
        status: 'queued',
        visual_version: null,
        progress_percent: null,
        progress_stage: null,
        attempt_count: 0,
        next_attempt_at: '2026-09-05T04:20:00.000Z',
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        started_at: null,
        completed_at: null,
        thumbnail_url: null,
        created_at: '2026-09-05T04:20:00.000Z',
        updated_at: '2026-09-05T04:20:00.000Z',
      },
    ];
    input.visuals = [
      {
        episode_id: EPISODE_C,
        status: 'queued',
        visual_version: null,
        progress_percent: null,
        progress_stage: null,
        attempt_count: 0,
        next_attempt_at: '2026-09-05T04:30:00.000Z',
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        started_at: null,
        completed_at: null,
        created_at: '2026-09-05T04:10:00.000Z',
        updated_at: '2026-09-05T04:10:00.000Z',
      },
    ];

    const queues = buildPipelineQueues(input);

    expect(queues.render.processing[0]).toMatchObject({
      episodeId: EPISODE_A,
      state: 'processing',
      workerId: 'render-machine-a',
      currentStep: 'encoding',
      progressPercent: 73,
    });
    expect(queues.render.queued.map((item) => item.episodeId)).toEqual([
      EPISODE_B,
      EPISODE_C,
    ]);
    expect(queues.render.queued[0]?.kind).toBe('render');
    expect(queues.render.queued[1]?.kind).toBe('visual');
  });

  it('marks an unleased stale visual version as blocked instead of queued', () => {
    const input = baseInput();
    input.visuals = [
      {
        episode_id: EPISODE_A,
        status: 'queued',
        visual_version: 'legacy-version',
        progress_percent: null,
        progress_stage: null,
        attempt_count: 0,
        next_attempt_at: '2026-09-05T04:00:00.000Z',
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        started_at: null,
        completed_at: null,
        created_at: '2026-09-05T04:00:00.000Z',
        updated_at: '2026-09-05T04:00:00.000Z',
      },
    ];

    const queues = buildPipelineQueues(input);

    expect(queues.render.queued).toHaveLength(0);
    expect(queues.render.attention[0]).toMatchObject({
      episodeId: EPISODE_A,
      state: 'blocked',
      currentStep: 'Stale visual version',
    });
  });

  it('derives social aggregate state without turning partial releases into failures', () => {
    expect(
      deriveSocialState([
        socialLane('published', 'x'),
        socialLane('published', 'threads'),
        socialLane('published', 'rednote'),
        socialLane('published', 'youtube'),
      ]),
    ).toBe('published');

    expect(
      deriveSocialState([
        socialLane('published', 'x'),
        socialLane('published', 'threads'),
        socialLane('queued', 'rednote'),
        socialLane('queued', 'youtube'),
      ]),
    ).toBe('partial');

    expect(
      deriveSocialState([
        socialLane('published', 'x'),
        socialLane('published', 'threads'),
        socialLane('published', 'rednote'),
        socialLane('failed', 'youtube'),
      ]),
    ).toBe('partial');

    expect(
      deriveSocialState([
        socialLane('failed', 'x'),
        socialLane('failed', 'threads'),
        socialLane('failed', 'rednote'),
        socialLane('failed', 'youtube'),
      ]),
    ).toBe('failed');
  });

  it('uses social_posts as publication truth and exposes stored URLs', () => {
    const input = baseInput();
    input.socialJobs = [
      {
        id: 'social-x',
        episode_id: EPISODE_A,
        platform: 'x',
        language_code: 'en',
        status: 'completed',
        scheduled_at: '2026-09-05T05:00:00.000Z',
        next_attempt_at: '2026-09-05T05:00:00.000Z',
        attempt_count: 1,
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        completed_at: '2026-09-05T05:05:00.000Z',
        created_at: '2026-09-05T04:00:00.000Z',
        updated_at: '2026-09-05T05:05:00.000Z',
      },
      {
        id: 'social-threads',
        episode_id: EPISODE_A,
        platform: 'threads',
        language_code: 'ja',
        status: 'completed',
        scheduled_at: '2026-09-05T05:00:00.000Z',
        next_attempt_at: '2026-09-05T05:00:00.000Z',
        attempt_count: 1,
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        completed_at: '2026-09-05T05:06:00.000Z',
        created_at: '2026-09-05T04:00:00.000Z',
        updated_at: '2026-09-05T05:06:00.000Z',
      },
      {
        id: 'social-rednote',
        episode_id: EPISODE_A,
        platform: 'rednote',
        language_code: 'zh-Hant',
        status: 'queued',
        scheduled_at: '2026-09-05T05:00:00.000Z',
        next_attempt_at: '2026-09-05T05:00:00.000Z',
        attempt_count: 0,
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        completed_at: null,
        created_at: '2026-09-05T04:00:00.000Z',
        updated_at: '2026-09-05T04:00:00.000Z',
      },
      {
        id: 'social-youtube',
        episode_id: EPISODE_A,
        platform: 'youtube',
        language_code: 'en',
        status: 'failed',
        scheduled_at: '2026-09-05T05:00:00.000Z',
        next_attempt_at: '2026-09-05T05:30:00.000Z',
        attempt_count: 2,
        lease_owner: null,
        lease_expires_at: null,
        last_error: 'upload rejected',
        completed_at: null,
        created_at: '2026-09-05T04:00:00.000Z',
        updated_at: '2026-09-05T05:10:00.000Z',
      },
    ];
    input.socialPosts = [
      {
        id: 'post-x',
        episode_id: EPISODE_A,
        platform: 'x',
        language_code: 'en',
        post_url: 'https://x.com/zap/status/123',
        published_at: '2026-09-05T05:05:00.000Z',
      },
      {
        id: 'post-threads',
        episode_id: EPISODE_A,
        platform: 'threads',
        language_code: 'ja',
        post_url: null,
        published_at: '2026-09-05T05:06:00.000Z',
      },
    ];

    const queues = buildPipelineQueues(input);
    const social = queues.social.queued[0]!;

    expect(social.state).toBe('partial');
    expect(
      social.platforms.map((lane) => [lane.platform, lane.status]),
    ).toEqual([
      ['x', 'published'],
      ['threads', 'published'],
      ['rednote', 'queued'],
      ['youtube', 'failed'],
    ]);
    expect(social.publishedLinks).toEqual([
      {
        platform: 'x',
        languageCode: 'en',
        publishedAt: '2026-09-05T05:05:00.000Z',
        url: 'https://x.com/zap/status/123',
      },
      {
        platform: 'threads',
        languageCode: 'ja',
        publishedAt: '2026-09-05T05:06:00.000Z',
        url: null,
      },
    ]);
  });

  it('orders social queue items by scheduled time with overdue work first', () => {
    const input = baseInput();
    input.socialJobs = [
      {
        id: 'social-b',
        episode_id: EPISODE_B,
        platform: 'x',
        language_code: 'en',
        status: 'queued',
        scheduled_at: '2026-09-05T05:40:00.000Z',
        next_attempt_at: '2026-09-05T05:40:00.000Z',
        attempt_count: 0,
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        completed_at: null,
        created_at: '2026-09-05T04:00:00.000Z',
        updated_at: '2026-09-05T04:00:00.000Z',
      },
      {
        id: 'social-a',
        episode_id: EPISODE_A,
        platform: 'x',
        language_code: 'en',
        status: 'queued',
        scheduled_at: '2026-09-05T05:10:00.000Z',
        next_attempt_at: '2026-09-05T05:10:00.000Z',
        attempt_count: 0,
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        completed_at: null,
        created_at: '2026-09-05T04:00:00.000Z',
        updated_at: '2026-09-05T04:00:00.000Z',
      },
    ];

    const queues = buildPipelineQueues(input);

    expect(queues.social.queued.map((item) => item.episodeId)).toEqual([
      EPISODE_A,
      EPISODE_B,
    ]);
  });
});

describe('abandoned video work', () => {
  it('moves an abandoned episode out of attention and counts it separately', () => {
    const input = baseInput();
    input.renders = [renderRow(), renderRow({ episode_id: EPISODE_A })];
    input.visualStates = [
      visualState({
        abandoned_at: '2026-09-04T00:00:00.000Z',
        abandoned_reason: 'Legacy zh-Hant-only render',
      }),
    ];

    const queues = buildPipelineQueues(input);

    expect(queues.render.attention).toHaveLength(0);
    expect(queues.render.abandoned).toHaveLength(2);
    expect(queues.render.abandoned?.[0]).toMatchObject({
      abandoned: { reason: 'Legacy zh-Hant-only render' },
      actions: {
        disabledReason: 'Closed by an operator: Legacy zh-Hant-only render',
      },
    });
    expect(queues.render.abandoned?.[0]?.actions.restart).toBeUndefined();
    expect(queues.summary.abandoned).toBe(2);
    expect(queues.summary.blockedOrFailed).toBe(0);
  });

  it('keeps a stale-version visual of an abandoned episode out of the blocked lane', () => {
    const input = baseInput();
    input.visuals = [
      visualRow({ status: 'queued', visual_version: 'legacy-version' }),
    ];
    input.visualStates = [
      visualState({
        visual_version: 'legacy-version',
        abandoned_at: '2026-09-04T00:00:00.000Z',
        abandoned_reason: 'Unfinishable backlog',
      }),
    ];

    const queues = buildPipelineQueues(input);

    expect(queues.render.attention).toHaveLength(0);
    expect(queues.render.abandoned?.[0]).toMatchObject({
      state: 'blocked',
      currentStep: 'Stale visual version',
    });
  });

  it('treats a visual row without an abandoned marker as ordinary work', () => {
    const input = baseInput();
    input.renders = [renderRow()];
    input.visualStates = [visualState()];

    const queues = buildPipelineQueues(input);

    expect(queues.render.abandoned).toHaveLength(0);
    expect(queues.render.attention).toHaveLength(1);
    expect(queues.summary.abandoned).toBe(0);
  });
});

describe('queue item restart actions', () => {
  it('offers a per-language render retry when the visual checkpoint is current', () => {
    const input = baseInput();
    input.renders = [renderRow()];
    input.visualStates = [visualState()];

    const queues = buildPipelineQueues(input);

    expect(queues.render.attention[0]?.actions.restart).toEqual({
      step: 'render',
      localizationId: LOCALIZATION_A,
    });
  });

  it('falls back to restarting the whole video when the visual is stale', () => {
    const input = baseInput();
    input.renders = [renderRow()];
    input.visualStates = [visualState({ visual_version: 'legacy-version' })];

    const queues = buildPipelineQueues(input);

    expect(queues.render.attention[0]?.actions.restart).toEqual({
      step: 'video',
      forceReplan: false,
    });
  });

  it('restarts video work for a failed visual plan', () => {
    const input = baseInput();
    input.visuals = [visualRow()];
    input.visualStates = [visualState({ status: 'failed' })];

    const queues = buildPipelineQueues(input);

    expect(queues.render.attention[0]?.actions.restart).toEqual({
      step: 'video',
      forceReplan: false,
    });
  });

  it('refuses a restart while a worker holds the lease', () => {
    const input = baseInput();
    input.renders = [
      renderRow({
        status: 'processing',
        lease_owner: 'render-machine-a',
        lease_expires_at: '2026-09-05T06:30:00.000Z',
      }),
    ];
    input.visualStates = [visualState()];

    const queues = buildPipelineQueues(input);

    expect(queues.render.processing[0]?.actions).toEqual({
      disabledReason: 'A worker holds this job right now.',
    });
  });

  it('refuses video work while the three audio prerequisites are incomplete', () => {
    const input = baseInput();
    input.visuals = [visualRow({ episode_id: EPISODE_B })];
    input.visualStates = [visualState({ episode_id: EPISODE_B })];

    const queues = buildPipelineQueues(input);

    expect(queues.render.attention[0]?.actions).toEqual({
      disabledReason:
        'Video work needs completed zh-Hant, ja and en audio before it can restart.',
    });
  });

  it('restarts a failed ingest and explains an ingest with no episode row', () => {
    const input = baseInput();
    input.ingests = [
      ingestRow(),
      ingestRow({ id: 'ingest-2', source_url: 'https://example.com/unknown' }),
    ];

    const queues = buildPipelineQueues(input);
    const [known, unknown] = queues.api.attention;

    expect(known?.actions.restart).toEqual({ step: 'ingest' });
    expect(unknown?.actions).toEqual({
      disabledReason:
        'This ingest never produced an episode row; re-submit the source URL to retry it.',
    });
  });
});
