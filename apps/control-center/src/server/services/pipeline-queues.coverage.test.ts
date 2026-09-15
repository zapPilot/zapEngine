import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import {
  buildPipelineQueues,
  createPipelineQueuesService,
  deriveSocialState,
} from './pipeline-queues.js';

const queueClient = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('./supabase.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./supabase.js')>();
  return {
    ...actual,
    createConfiguredServiceRoleClient: () => queueClient.current,
  };
});

const NOW = new Date('2026-09-05T06:00:00.000Z');
const EP_A = '11111111-1111-4111-8111-111111111111';
const LOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

type Input = Parameters<typeof buildPipelineQueues>[0];

function base(): Input {
  return {
    generatedAt: NOW.toISOString(),
    now: NOW,
    episodes: [
      {
        id: EP_A,
        source_title: 'A',
        source_url: 'https://example.com/a',
        created_at: '2026-09-05T03:00:00.000Z',
      },
    ],
    localizations: [
      {
        id: LOC_A,
        episode_id: EP_A,
        language_code: 'zh-Hant',
        script: 's',
        hls_url: 'https://cdn.example/a.m3u8',
        classroom_hls_url: 'https://cdn.example/c.m3u8',
        status: 'completed',
        updated_at: '2026-09-05T04:00:00Z',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        episode_id: EP_A,
        language_code: 'ja',
        script: 's',
        hls_url: 'https://cdn.example/j.m3u8',
        classroom_hls_url: null,
        status: 'completed',
        updated_at: '2026-09-05T04:00:00Z',
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        episode_id: EP_A,
        language_code: 'en',
        script: 's',
        hls_url: 'https://cdn.example/e.m3u8',
        classroom_hls_url: null,
        status: 'completed',
        updated_at: '2026-09-05T04:00:00Z',
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

function visual(overrides: Record<string, unknown> = {}) {
  return {
    episode_id: EP_A,
    status: 'failed',
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    progress_percent: null,
    progress_stage: 'Visual planning',
    attempt_count: 2,
    next_attempt_at: '2026-09-05T04:00:00Z',
    lease_owner: null,
    lease_expires_at: null,
    last_error: 'visual boom',
    started_at: '2026-09-05T04:10:00Z',
    completed_at: null,
    created_at: '2026-09-05T04:00:00Z',
    updated_at: '2026-09-05T04:30:00Z',
    ...overrides,
  } as Input['visuals'][number];
}

describe('pipeline queues coverage', () => {
  it('serves unconfigured without Supabase', async () => {
    queueClient.current = null;
    const svc = createPipelineQueuesService({
      config: readControlCenterConfig({}),
      now: () => NOW,
    });
    const res = await svc.getQueues();
    expect(res.status).toBe('unconfigured');
    expect(res.summary.queueDepth).toBe(0);
  });

  it('maps a queue read failure to error', async () => {
    queueClient.current = {
      from: () => ({
        select: () => ({
          in: () => ({
            order: () => ({
              order: () => ({
                limit: () =>
                  Promise.resolve({
                    data: null,
                    error: { message: 'queue down' },
                  }),
              }),
              limit: () =>
                Promise.resolve({
                  data: null,
                  error: { message: 'queue down' },
                }),
            }),
          }),
        }),
      }),
    };
    const svc = createPipelineQueuesService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
      now: () => NOW,
    });
    const res = await svc.getQueues();
    expect(res.status).toBe('error');
    expect(res.message).toBe('queue down');
  });

  it('splits abandoned visuals out of the working render lane', () => {
    const input = base();
    input.visuals = [visual({ status: 'failed' })];
    input.visualStates = [
      {
        episode_id: EP_A,
        status: 'failed',
        visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        abandoned_at: '2026-09-05T05:00:00Z',
        abandoned_reason: 'nope',
      },
    ];
    const res = buildPipelineQueues(input);
    expect(res.summary.abandoned).toBe(1);
    expect(res.render.abandoned).toHaveLength(1);
    expect(res.render.attention).toHaveLength(0);
    expect(res.render.queued).toHaveLength(0);
  });

  it('reports stale visual versions as blocked with a stale step', () => {
    const input = base();
    input.visuals = [
      visual({ status: 'queued', visual_version: 'v0', attempt_count: 0 }),
    ];
    const res = buildPipelineQueues(input);
    expect(res.render.attention[0]?.currentStep).toBe('Stale visual version');
    expect(res.render.attention[0]?.state).toBe('blocked');
  });

  it('marks ingest items without an episode row as non-restartable', () => {
    const input = base();
    input.episodes = [];
    input.ingests = [
      {
        id: 'ing-1',
        source_url: 'https://example.com/missing',
        language_code: 'zh-Hant',
        status: 'failed',
        attempt_count: 2,
        lease_owner: null,
        lease_expires_at: null,
        last_error: 'boom',
        created_at: '2026-09-05T03:00:00Z',
        updated_at: '2026-09-05T04:00:00Z',
      },
    ];
    const res = buildPipelineQueues(input);
    expect(res.api.attention[0]?.actions).toMatchObject({
      disabledReason: expect.stringContaining('never produced an episode'),
    });
  });

  it('offers render-local restart only when the shared visual is renderable', () => {
    const input = base();
    input.renders = [
      {
        episode_localization_id: LOC_A,
        episode_id: EP_A,
        status: 'failed',
        visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        progress_percent: null,
        progress_stage: 'Rendering',
        attempt_count: 2,
        next_attempt_at: '2026-09-05T04:00:00Z',
        lease_owner: null,
        lease_expires_at: null,
        last_error: 'raster',
        started_at: null,
        completed_at: null,
        thumbnail_url: null,
        created_at: '2026-09-05T04:00:00Z',
        updated_at: '2026-09-05T04:30:00Z',
      },
    ];
    input.visualStates = [
      {
        episode_id: EP_A,
        status: 'completed',
        visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        abandoned_at: null,
        abandoned_reason: null,
      },
    ];
    const res = buildPipelineQueues(input);
    expect(res.render.attention[0]?.actions).toEqual({
      restart: { step: 'render', localizationId: LOC_A },
    });
  });

  it('derives social publishing/partial/failed from platform states', () => {
    expect(deriveSocialState([{ status: 'publishing' }] as never)).toBe(
      'publishing',
    );
    expect(
      deriveSocialState([
        { status: 'published' },
        { status: 'failed' },
      ] as never),
    ).toBe('partial');
    expect(
      deriveSocialState([{ status: 'failed' }, { status: 'failed' }] as never),
    ).toBe('failed');
    expect(
      deriveSocialState([{ status: 'failed' }, { status: 'queued' }] as never),
    ).toBe('partial');
    expect(deriveSocialState([{ status: 'queued' }] as never)).toBe('queued');
    expect(
      deriveSocialState([
        { status: 'published' },
        { status: 'published' },
      ] as never),
    ).toBe('published');
  });

  it('drops unknown social platforms and sorts history by time', () => {
    const input = base();
    input.socialJobs = [
      {
        id: 'j1',
        episode_id: EP_A,
        platform: 'unknown',
        language_code: 'en',
        status: 'queued',
        scheduled_at: '2026-09-05T07:00:00Z',
        next_attempt_at: '2026-09-05T07:00:00Z',
        attempt_count: 1,
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        completed_at: null,
        created_at: '2026-09-05T06:00:00Z',
        updated_at: '2026-09-05T06:00:00Z',
      },
      {
        id: 'j2',
        episode_id: EP_A,
        platform: 'x',
        language_code: 'en',
        status: 'failed',
        scheduled_at: '2026-09-05T05:00:00Z',
        next_attempt_at: '2026-09-05T05:00:00Z',
        attempt_count: 2,
        lease_owner: null,
        lease_expires_at: null,
        last_error: 'post boom',
        completed_at: null,
        created_at: '2026-09-05T04:00:00Z',
        updated_at: '2026-09-05T05:30:00Z',
      },
    ];
    input.socialPosts = [];
    const res = buildPipelineQueues(input);
    expect(res.social.attention).toHaveLength(1);
    expect(res.social.attention[0]?.platforms).toHaveLength(1);
    const history = res.social.attention[0]?.history ?? [];
    expect(history[0]?.at).toBe('2026-09-05T04:00:00Z');
    expect(history.some((e) => e.detail === 'post boom')).toBe(true);
  });

  it('covers ingest steps and lease-held work items', () => {
    const input = base();
    input.localizations = [];
    input.ingests = [
      {
        id: 'ing-1',
        source_url: 'https://example.com/a',
        language_code: 'zh-Hant',
        status: 'processing',
        attempt_count: 1,
        lease_owner: 'w1',
        lease_expires_at: '2026-09-05T07:00:00Z',
        last_error: null,
        created_at: '2026-09-05T03:00:00Z',
        updated_at: '2026-09-05T04:00:00Z',
      },
    ];
    const res = buildPipelineQueues(input);
    expect(res.api.processing).toHaveLength(1);
    expect(res.api.processing[0]?.workerId).toBe('w1');
    expect(res.api.processing[0]?.actions).toMatchObject({
      disabledReason: expect.stringContaining('holds this job'),
    });
  });
});
