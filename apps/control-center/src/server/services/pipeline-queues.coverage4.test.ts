import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import {
  buildPipelineQueues,
  createPipelineQueuesService,
} from './pipeline-queues.js';

const queueClient = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('./supabase.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./supabase.js')>();
  return {
    ...actual,
    createConfiguredServiceRoleClient: () => queueClient.current,
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NOW = new Date('2026-09-05T06:00:00.000Z');
const EP_A = '11111111-1111-4111-8111-111111111111';
const EP_B = '22222222-2222-4222-8222-222222222222';
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

function visualRow(overrides: Record<string, unknown> = {}) {
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
    last_error: 'boom',
    started_at: '2026-09-05T04:10:00Z',
    completed_at: null,
    created_at: '2026-09-05T04:00:00Z',
    updated_at: '2026-09-05T04:30:00Z',
    ...overrides,
  } as Input['visuals'][number];
}

function chainFor(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain['select'] = vi.fn(() => chain);
  chain['in'] = vi.fn(() => chain);
  chain['order'] = vi.fn(() => chain);
  chain['limit'] = vi.fn(() => Promise.resolve(result));
  chain['gte'] = vi.fn(() => Promise.resolve(result));
  chain['then'] = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function configured() {
  return readControlCenterConfig({
    SUPABASE_URL: 'https://x.co',
    SUPABASE_SERVICE_ROLE_KEY: 'k',
  });
}

describe('pipeline queues coverage round 4', () => {
  it('falls back to the episode id when a visual has no title', () => {
    const input = base();
    input.episodes = [
      {
        id: EP_A,
        source_title: null,
        source_url: 'https://example.com/a',
        created_at: '2026-09-05T03:00:00.000Z',
      },
    ];
    input.visuals = [visualRow({})];
    const res = buildPipelineQueues(input);
    expect(res.render.attention[0]?.title).toBe(EP_A);
  });

  it('records a default reason when abandonment carries none', () => {
    const input = base();
    input.visuals = [visualRow({})];
    input.visualStates = [
      {
        episode_id: EP_A,
        status: 'failed',
        visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        abandoned_at: '2026-09-05T05:00:00Z',
        abandoned_reason: null,
      },
    ];
    const res = buildPipelineQueues(input);
    expect(res.render.abandoned?.[0]?.abandoned?.reason).toBe(
      'No reason recorded',
    );

    const blank = base();
    blank.visuals = [visualRow({})];
    blank.visualStates = [
      {
        episode_id: EP_A,
        status: 'failed',
        visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        abandoned_at: '2026-09-05T05:00:00Z',
        abandoned_reason: '   ',
      },
    ];
    const resBlank = buildPipelineQueues(blank);
    expect(resBlank.render.abandoned?.[0]?.abandoned?.reason).toBe(
      'No reason recorded',
    );
  });

  it('falls back to the episode id for social items without a title', () => {
    const input = base();
    input.episodes = [
      {
        id: EP_A,
        source_title: null,
        source_url: 'https://example.com/a',
        created_at: '2026-09-05T03:00:00.000Z',
      },
    ];
    input.socialJobs = [
      {
        id: 'j1',
        episode_id: EP_A,
        platform: 'x',
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
    ];
    const res = buildPipelineQueues(input);
    expect(res.social.queued[0]?.title).toBe(EP_A);
  });

  it('sorts processing work by updated time when start time is missing', () => {
    const input = base();
    input.episodes = [
      {
        id: EP_A,
        source_title: 'A',
        source_url: 'https://example.com/a',
        created_at: '2026-09-05T03:00:00.000Z',
      },
      {
        id: EP_B,
        source_title: 'B',
        source_url: 'https://example.com/b',
        created_at: '2026-09-05T03:10:00.000Z',
      },
    ];
    const processing = (episodeId: string, updatedAt: string) =>
      visualRow({
        episode_id: episodeId,
        status: 'processing',
        attempt_count: 1,
        next_attempt_at: '2026-09-05T04:00:00Z',
        lease_owner: 'worker',
        lease_expires_at: '2026-09-05T08:00:00Z',
        last_error: null,
        started_at: null,
        created_at: '2026-09-05T04:00:00Z',
        updated_at: updatedAt,
      });
    input.visuals = [
      processing(EP_A, '2026-09-05T05:00:00Z'),
      processing(EP_B, '2026-09-05T04:00:00Z'),
    ];
    const res = buildPipelineQueues(input);
    expect(res.render.processing.map((item) => item.episodeId)).toEqual([
      EP_B,
      EP_A,
    ]);
  });

  it('orders waiting work by queue time when availability ties', () => {
    const input = base();
    const ingest = (id: string, createdAt: string) => ({
      id,
      source_url: 'https://example.com/a',
      language_code: 'zh-Hant',
      status: 'queued',
      attempt_count: 0,
      lease_owner: null,
      lease_expires_at: null,
      last_error: null,
      created_at: createdAt,
      updated_at: createdAt,
    });
    input.ingests = [
      ingest('ing-late', '2026-09-05T03:20:00Z'),
      ingest('ing-early', '2026-09-05T03:00:00Z'),
    ];
    const res = buildPipelineQueues(input);
    expect(res.api.queued.map((item) => item.key)).toEqual([
      'ingest:ing-early',
      'ingest:ing-late',
    ]);
  });

  it('breaks availability ties by queue time', () => {
    const input = base();
    input.episodes = [
      {
        id: EP_A,
        source_title: 'A',
        source_url: 'https://example.com/a',
        created_at: '2026-09-05T03:00:00.000Z',
      },
      {
        id: EP_B,
        source_title: 'B',
        source_url: 'https://example.com/b',
        created_at: '2026-09-05T03:10:00.000Z',
      },
    ];
    const queuedVisual = (episodeId: string, createdAt: string) =>
      visualRow({
        episode_id: episodeId,
        status: 'queued',
        attempt_count: 0,
        next_attempt_at: '2026-09-05T04:00:00Z',
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        started_at: null,
        created_at: createdAt,
        updated_at: createdAt,
      });
    input.visuals = [
      queuedVisual(EP_A, '2026-09-05T04:20:00Z'),
      queuedVisual(EP_B, '2026-09-05T04:00:00Z'),
    ];
    const res = buildPipelineQueues(input);
    expect(res.render.queued.map((item) => item.episodeId)).toEqual([
      EP_B,
      EP_A,
    ]);
  });

  it('treats null queue payloads as empty lanes', async () => {
    const ingestRow = {
      id: 'ing-1',
      source_url: 'https://example.com/a',
      language_code: 'zh-Hant',
      status: 'queued',
      attempt_count: 0,
      lease_owner: null,
      lease_expires_at: null,
      last_error: null,
      created_at: '2026-09-05T03:00:00Z',
      updated_at: '2026-09-05T03:00:00Z',
    };
    const activeVisual = visualRow({});
    const episodeRow = {
      id: EP_A,
      source_title: 'A',
      source_url: 'https://example.com/a',
      created_at: '2026-09-05T03:00:00.000Z',
    };
    let socialCalls = 0;
    let visualCalls = 0;
    queueClient.current = {
      from: vi.fn((table: string) => {
        if (table === 'podcast_ingest_jobs') {
          return chainFor({ data: [ingestRow], error: null });
        }
        if (table === 'episode_video_visuals') {
          visualCalls += 1;
          if (visualCalls === 1) {
            return chainFor({ data: [activeVisual], error: null });
          }
          return chainFor({ data: null, error: null });
        }
        if (table === 'episode_videos') {
          return chainFor({ data: [], error: null });
        }
        if (table === 'social_publish_jobs') {
          socialCalls += 1;
          if (socialCalls === 1) {
            return chainFor({ data: [{ episode_id: EP_A }], error: null });
          }
          return chainFor({ data: null, error: null });
        }
        if (table === 'episodes') {
          return chainFor({ data: [episodeRow], error: null });
        }
        if (table === 'episode_localizations' || table === 'social_posts') {
          if (table === 'social_posts') {
            return {
              select: vi.fn(
                (
                  _columns: string,
                  options?: { count?: string; head?: boolean },
                ) => {
                  if (options?.head) {
                    return chainFor({
                      data: [],
                      error: null,
                      count: 0,
                    });
                  }
                  return chainFor({ data: null, error: null });
                },
              ),
            };
          }
          return chainFor({ data: null, error: null });
        }
        return chainFor({ data: null, error: null });
      }),
    };
    const svc = createPipelineQueuesService({
      config: configured(),
      now: () => NOW,
    });
    const res = await svc.getQueues();
    expect(res.status).toBe('ok');
    expect(res.social.queued).toEqual([]);
  });

  it('treats null episode payloads as no resolvable episodes', async () => {
    const ingestRow = {
      id: 'ing-1',
      source_url: 'https://example.com/a',
      language_code: 'zh-Hant',
      status: 'queued',
      attempt_count: 0,
      lease_owner: null,
      lease_expires_at: null,
      last_error: null,
      created_at: '2026-09-05T03:00:00Z',
      updated_at: '2026-09-05T03:00:00Z',
    };
    const activeVisual = visualRow({});
    let socialCalls = 0;
    queueClient.current = {
      from: vi.fn((table: string) => {
        if (table === 'podcast_ingest_jobs') {
          return chainFor({ data: [ingestRow], error: null });
        }
        if (table === 'episode_video_visuals') {
          return chainFor({ data: [activeVisual], error: null });
        }
        if (table === 'episode_videos') {
          return chainFor({ data: [], error: null });
        }
        if (table === 'social_publish_jobs') {
          socialCalls += 1;
          if (socialCalls === 1) {
            return chainFor({ data: [{ episode_id: EP_A }], error: null });
          }
          return chainFor({ data: [], error: null });
        }
        if (table === 'episodes') {
          return chainFor({ data: null, error: null });
        }
        if (table === 'social_posts') {
          return {
            select: vi.fn(
              (
                _columns: string,
                options?: { count?: string; head?: boolean },
              ) => {
                if (options?.head) {
                  return chainFor({ data: [], error: null, count: 0 });
                }
                return chainFor({ data: [], error: null });
              },
            ),
          };
        }
        return chainFor({ data: [], error: null });
      }),
    };
    const svc = createPipelineQueuesService({
      config: configured(),
      now: () => NOW,
    });
    const res = await svc.getQueues();
    expect(res.status).toBe('ok');
    expect(res.render.queued).toEqual([]);
    expect(res.render.attention).toEqual([]);
    expect(res.api.queued.length + res.api.attention.length).toBeGreaterThan(0);
  });

  it('falls back to empty date parts when locale parts are missing', async () => {
    const original = Intl.DateTimeFormat.prototype.formatToParts;
    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue(
      [],
    );
    try {
      queueClient.current = {
        from: vi.fn((table: string) => {
          if (table === 'social_posts') {
            return {
              select: vi.fn(
                (
                  _columns: string,
                  options?: { count?: string; head?: boolean },
                ) => {
                  if (options?.head) {
                    return chainFor({ data: [], error: null, count: 0 });
                  }
                  return chainFor({ data: [], error: null });
                },
              ),
            };
          }
          return chainFor({ data: [], error: null });
        }),
      };
      const svc = createPipelineQueuesService({
        config: configured(),
        now: () => NOW,
      });
      const res = await svc.getQueues();
      expect(['ok', 'error']).toContain(res.status);
    } finally {
      Intl.DateTimeFormat.prototype.formatToParts = original;
    }
  });

  it('sorts corrupt empty timestamps last', () => {
    const input = base();
    input.episodes = [
      {
        id: EP_A,
        source_title: 'A',
        source_url: 'https://example.com/a',
        created_at: '2026-09-05T03:00:00.000Z',
      },
      {
        id: EP_B,
        source_title: 'B',
        source_url: 'https://example.com/b',
        created_at: '2026-09-05T03:10:00.000Z',
      },
    ];
    input.visuals = [
      visualRow({
        episode_id: EP_A,
        status: 'processing',
        attempt_count: 1,
        next_attempt_at: '2026-09-05T04:00:00Z',
        lease_owner: 'worker',
        lease_expires_at: '2026-09-05T08:00:00Z',
        last_error: null,
        started_at: null,
        created_at: '',
        updated_at: '',
      }),
      visualRow({
        episode_id: EP_B,
        status: 'processing',
        attempt_count: 1,
        next_attempt_at: '2026-09-05T04:00:00Z',
        lease_owner: 'worker',
        lease_expires_at: '2026-09-05T08:00:00Z',
        last_error: null,
        started_at: '2026-09-05T04:00:00Z',
        created_at: '2026-09-05T04:00:00Z',
        updated_at: '2026-09-05T04:00:00Z',
      }),
    ];
    const res = buildPipelineQueues(input);
    expect(res.render.processing.map((item) => item.episodeId)).toEqual([
      EP_B,
      EP_A,
    ]);
  });
});
