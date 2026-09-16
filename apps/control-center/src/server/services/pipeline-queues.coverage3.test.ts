import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { describe, expect, it, vi } from 'vitest';

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

describe('pipeline queues coverage round 3', () => {
  it('walks the full read path with non-empty lanes', async () => {
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
    const visualRow = {
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
      started_at: null,
      completed_at: null,
      created_at: '2026-09-05T04:00:00Z',
      updated_at: '2026-09-05T04:30:00Z',
    };
    const renderRow = {
      ...visualRow,
      episode_localization_id: LOC_A,
      thumbnail_url: null,
    };
    const socialActive = { episode_id: EP_A };
    const socialJob = {
      id: 'sj-1',
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
    };
    const episodeRow = {
      id: EP_A,
      source_title: 'A',
      source_url: 'https://example.com/a',
      created_at: '2026-09-05T03:00:00.000Z',
    };
    const localizationRow = {
      id: LOC_A,
      episode_id: EP_A,
      language_code: 'zh-Hant',
      script: 's',
      hls_url: 'https://cdn.example/a.m3u8',
      classroom_hls_url: 'https://cdn.example/c.m3u8',
      status: 'completed',
      updated_at: '2026-09-05T04:00:00Z',
    };
    const visualStateRow = {
      episode_id: EP_A,
      status: 'failed',
      visual_version: EPISODE_VIDEO_VISUAL_VERSION,
      abandoned_at: null,
      abandoned_reason: null,
    };
    const socialPost = {
      id: 'p1',
      episode_id: EP_A,
      platform: 'youtube',
      language_code: 'ja',
      post_url: null,
      published_at: '2026-09-05T05:00:00Z',
    };

    const calls = { visuals: 0, socialJobs: 0 };

    queueClient.current = {
      from: vi.fn((table: string) => {
        if (table === 'podcast_ingest_jobs') {
          return chainFor({ data: [ingestRow], error: null });
        }
        if (table === 'episode_video_visuals') {
          calls.visuals += 1;
          // First call is the active-work query; the second is visualStates.
          return calls.visuals === 1
            ? chainFor({ data: [visualRow], error: null })
            : chainFor({ data: [visualStateRow], error: null });
        }
        if (table === 'episode_videos') {
          return chainFor({ data: [renderRow], error: null });
        }
        if (table === 'social_publish_jobs') {
          calls.socialJobs += 1;
          return calls.socialJobs === 1
            ? chainFor({ data: [socialActive], error: null })
            : chainFor({ data: [socialJob], error: null });
        }
        if (table === 'episodes') {
          return chainFor({ data: [episodeRow], error: null });
        }
        if (table === 'episode_localizations') {
          return chainFor({ data: [localizationRow], error: null });
        }
        if (table === 'social_posts') {
          return {
            select: vi.fn(
              (
                _columns: string,
                options?: { count?: string; head?: boolean },
              ) => {
                if (options?.head) {
                  return chainFor({ data: [], error: null, count: 2 });
                }
                return chainFor({ data: [socialPost], error: null });
              },
            ),
          };
        }
        return chainFor({ data: [], error: null });
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

    expect(res.status).toBe('ok');
    expect(res.summary.queueDepth).toBeGreaterThan(0);
    expect(res.api.queued.length + res.api.attention.length).toBeGreaterThan(0);
    expect(
      res.render.queued.length + res.render.attention.length,
    ).toBeGreaterThan(0);
    expect(res.summary.publishedToday).toBe(2);
    expect(
      res.social.queued.length +
        res.social.attention.length +
        res.social.processing.length,
    ).toBeGreaterThan(0);
  });

  it('returns null-data fallbacks as empty rows', async () => {
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
                  return chainFor({ data: null, error: null, count: null });
                }
                return chainFor({ data: null, error: null });
              },
            ),
          };
        }
        return chainFor({ data: null, error: null });
      }),
    };
    // readSocialJobs/readRowsByEpisode null-data path is exercised through a
    // minimal ok board: reuse the empty-board shape from round 2 by calling
    // getQueues with active rows that resolve to null payloads.
    const svc = createPipelineQueuesService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
      now: () => NOW,
    });
    const res = await svc.getQueues();
    expect(res.status).toBe('ok');
    expect(res.summary.queueDepth).toBe(0);
  });

  it('reports the TTS ingest step when audio is missing', () => {
    const input = base();
    input.ingests = [
      {
        id: 'ing-tts',
        source_url: 'https://example.com/a',
        language_code: 'zh-Hant',
        status: 'queued',
        attempt_count: 0,
        lease_owner: null,
        lease_expires_at: null,
        last_error: null,
        created_at: '2026-09-05T03:00:00Z',
        updated_at: '2026-09-05T03:00:00Z',
      },
    ];
    input.localizations = [
      {
        id: LOC_A,
        episode_id: EP_A,
        language_code: 'zh-Hant',
        script: 'translated',
        hls_url: '',
        classroom_hls_url: null,
        status: 'processing',
        updated_at: '2026-09-05T04:00:00Z',
      },
    ];
    const res = buildPipelineQueues(input);
    expect(res.api.queued[0]?.currentStep).toBe('TTS');
  });

  it('requires completed status and audio before video prerequisites pass', () => {
    const input = base();
    input.localizations = [
      {
        id: LOC_A,
        episode_id: EP_A,
        language_code: 'zh-Hant',
        script: 's',
        hls_url: '',
        classroom_hls_url: null,
        status: 'completed',
        updated_at: '2026-09-05T04:00:00Z',
      },
    ];
    input.visuals = [
      {
        episode_id: EP_A,
        status: 'failed',
        visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        progress_percent: null,
        progress_stage: null,
        attempt_count: 2,
        next_attempt_at: '2026-09-05T04:00:00Z',
        lease_owner: null,
        lease_expires_at: null,
        last_error: 'boom',
        started_at: null,
        completed_at: null,
        created_at: '2026-09-05T04:00:00Z',
        updated_at: '2026-09-05T04:00:00Z',
      },
    ];
    const res = buildPipelineQueues(input);
    expect(res.render.attention[0]?.actions).toMatchObject({
      disabledReason: expect.stringContaining('zh-Hant, ja and en audio'),
    });
  });
});
