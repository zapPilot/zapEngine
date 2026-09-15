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
    episodes: [{ id: EP_A, source_title: 'A', source_url: 'https://example.com/a', created_at: '2026-09-05T03:00:00.000Z' }],
    localizations: [
      { id: LOC_A, episode_id: EP_A, language_code: 'zh-Hant', script: 's', hls_url: 'https://cdn.example/a.m3u8', classroom_hls_url: 'https://cdn.example/c.m3u8', status: 'completed', updated_at: '2026-09-05T04:00:00Z' },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', episode_id: EP_A, language_code: 'ja', script: 's', hls_url: 'https://cdn.example/j.m3u8', classroom_hls_url: null, status: 'completed', updated_at: '2026-09-05T04:00:00Z' },
      { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', episode_id: EP_A, language_code: 'en', script: 's', hls_url: 'https://cdn.example/e.m3u8', classroom_hls_url: null, status: 'completed', updated_at: '2026-09-05T04:00:00Z' },
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

function okClient() {
  const empty = { data: [], error: null, count: 0 };
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain['select'] = () => chain;
      chain['in'] = () => chain;
      chain['order'] = () => chain;
      chain['limit'] = () => Promise.resolve(table === 'social_posts' ? { ...empty } : empty);
      chain['gte'] = () => Promise.resolve({ ...empty });
      return chain;
    },
  };
}

describe('pipeline queues coverage round 2', () => {
  it('serves an empty ok board through the full read path with default now', async () => {
    queueClient.current = okClient();
    const svc = createPipelineQueuesService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    });
    const res = await svc.getQueues();
    expect(res.status).toBe('ok');
    expect(res.summary.publishedToday).toBe(0);
  });

  it('drops visuals and renders whose episode row is missing', () => {
    const input = base();
    input.episodes = [];
    input.visuals = [
      { episode_id: 'missing', status: 'failed', visual_version: EPISODE_VIDEO_VISUAL_VERSION, progress_percent: null, progress_stage: null, attempt_count: 1, next_attempt_at: '2026-09-05T04:00:00Z', lease_owner: null, lease_expires_at: null, last_error: 'x', started_at: null, completed_at: null, created_at: '2026-09-05T04:00:00Z', updated_at: '2026-09-05T04:00:00Z' },
    ];
    input.renders = [
      { episode_localization_id: LOC_A, episode_id: 'missing', status: 'failed', visual_version: EPISODE_VIDEO_VISUAL_VERSION, progress_percent: null, progress_stage: null, attempt_count: 1, next_attempt_at: '2026-09-05T04:00:00Z', lease_owner: null, lease_expires_at: null, last_error: 'x', started_at: null, completed_at: null, thumbnail_url: null, created_at: '2026-09-05T04:00:00Z', updated_at: '2026-09-05T04:00:00Z' },
    ];
    const res = buildPipelineQueues(input);
    expect(res.summary.queueDepth).toBe(0);
  });

  it('refuses video restart until all three audio tracks are ready', () => {
    const input = base();
    input.localizations = [
      { id: LOC_A, episode_id: EP_A, language_code: 'zh-Hant', script: 's', hls_url: 'https://cdn.example/a.m3u8', classroom_hls_url: null, status: 'processing', updated_at: '2026-09-05T04:00:00Z' },
    ];
    input.visuals = [
      { episode_id: EP_A, status: 'failed', visual_version: EPISODE_VIDEO_VISUAL_VERSION, progress_percent: null, progress_stage: null, attempt_count: 2, next_attempt_at: '2026-09-05T04:00:00Z', lease_owner: null, lease_expires_at: null, last_error: 'boom', started_at: null, completed_at: null, created_at: '2026-09-05T04:00:00Z', updated_at: '2026-09-05T04:00:00Z' },
    ];
    const res = buildPipelineQueues(input);
    expect(res.render.attention[0]?.actions).toMatchObject({
      disabledReason: expect.stringContaining('zh-Hant, ja and en audio'),
    });
  });

  it('records completed history and skipped/completed-orphan social states', () => {
    const input = base();
    input.visuals = [
      { episode_id: EP_A, status: 'failed', visual_version: EPISODE_VIDEO_VISUAL_VERSION, progress_percent: null, progress_stage: null, attempt_count: 1, next_attempt_at: '2026-09-05T04:00:00Z', lease_owner: null, lease_expires_at: null, last_error: null, started_at: '2026-09-05T04:10:00Z', completed_at: '2026-09-05T05:00:00Z', created_at: '2026-09-05T04:00:00Z', updated_at: '2026-09-05T05:00:00Z' },
    ];
    input.socialJobs = [
      { id: 'j1', episode_id: EP_A, platform: 'x', language_code: 'en', status: 'skipped', scheduled_at: '2026-09-05T05:00:00Z', next_attempt_at: '2026-09-05T05:00:00Z', attempt_count: 1, lease_owner: null, lease_expires_at: null, last_error: null, completed_at: null, created_at: '2026-09-05T04:00:00Z', updated_at: '2026-09-05T05:00:00Z' },
      { id: 'j2', episode_id: EP_A, platform: 'threads', language_code: 'en', status: 'processing', scheduled_at: '2026-09-05T05:00:00Z', next_attempt_at: '2026-09-05T05:00:00Z', attempt_count: 1, lease_owner: 'w', lease_expires_at: '2026-09-05T07:00:00Z', last_error: null, completed_at: null, created_at: '2026-09-05T04:00:00Z', updated_at: '2026-09-05T05:00:00Z' },
      { id: 'j3', episode_id: EP_A, platform: 'youtube', language_code: 'en', status: 'completed', scheduled_at: '2026-09-05T05:00:00Z', next_attempt_at: '2026-09-05T05:00:00Z', attempt_count: 1, lease_owner: null, lease_expires_at: null, last_error: null, completed_at: '2026-09-05T05:00:00Z', created_at: '2026-09-05T04:00:00Z', updated_at: '2026-09-05T05:00:00Z' },
      { id: 'j4', episode_id: EP_A, platform: 'rednote', language_code: 'en', status: 'processing', scheduled_at: '2026-09-05T05:00:00Z', next_attempt_at: '2026-09-05T05:00:00Z', attempt_count: 1, lease_owner: null, lease_expires_at: null, last_error: null, completed_at: null, created_at: '2026-09-05T04:00:00Z', updated_at: '2026-09-05T05:00:00Z' },
    ];
    const res = buildPipelineQueues(input);
    const visual = res.render.attention[0] ?? res.render.queued[0];
    expect(visual?.history.map((h) => h.label)).toContain('Completed');
    const item = res.social.processing[0] ?? res.social.queued[0] ?? res.social.attention[0];
    const byPlatform = new Map((item?.platforms ?? []).map((p) => [p.platform, p.status]));
    expect(byPlatform.get('x')).toBe('skipped');
    expect(byPlatform.get('threads')).toBe('publishing');
    expect(byPlatform.get('youtube')).toBe('failed');
    expect(byPlatform.get('rednote')).toBe('queued');
  });

  it('sorts processing lanes by start time and waiting lanes by availability', () => {
    const input = base();
    const mkVisual = (id: string, startedAt: string, nextAttemptAt: string) => ({
      episode_id: EP_A, status: 'processing', visual_version: EPISODE_VIDEO_VISUAL_VERSION, progress_percent: null, progress_stage: null, attempt_count: 1, next_attempt_at: nextAttemptAt, lease_owner: 'w', lease_expires_at: '2026-09-05T08:00:00Z', last_error: null, started_at: startedAt, completed_at: null, created_at: '2026-09-05T04:00:00Z', updated_at: startedAt,
    });
    // processing with active lease sorts by startedAt; use two episodes
    input.episodes = [
      ...input.episodes,
      { id: '22222222-2222-4222-8222-222222222222', source_title: 'B', source_url: 'https://example.com/b', created_at: '2026-09-05T03:10:00Z' },
    ];
    input.visuals = [
      { ...mkVisual('a', '2026-09-05T05:00:00Z', '2026-09-05T04:00:00Z'), episode_id: EP_A },
      { ...mkVisual('b', '2026-09-05T04:00:00Z', '2026-09-05T04:00:00Z'), episode_id: '22222222-2222-4222-8222-222222222222' },
    ];
    const res = buildPipelineQueues(input);
    expect(res.render.processing.map((i) => i.episodeId)).toEqual([
      '22222222-2222-4222-8222-222222222222',
      EP_A,
    ]);
  });

  it('walks ingest steps and drops unknown published platforms', () => {
    const input = base();
    input.ingests = [
      { id: 'ing-t', source_url: 'https://example.com/a', language_code: 'zh-Hant', status: 'queued', attempt_count: 0, lease_owner: null, lease_expires_at: null, last_error: null, created_at: '2026-09-05T03:00:00Z', updated_at: '2026-09-05T03:00:00Z' },
    ];
    input.localizations = [
      { id: LOC_A, episode_id: EP_A, language_code: 'zh-Hant', script: null, hls_url: '', classroom_hls_url: null, status: 'processing', updated_at: '2026-09-05T04:00:00Z' },
    ];
    input.socialPosts = [
      { id: 'p1', episode_id: EP_A, platform: 'unknown', language_code: 'en', post_url: null, published_at: '2026-09-05T05:00:00Z' },
    ];
    const res = buildPipelineQueues(input);
    expect(res.api.queued[0]?.currentStep).toBe('Translate');
    expect(res.api.queued[0]?.publishedLinks).toEqual([]);
  });

  it('skips social episodes without rows and without lanes', () => {
    const input = base();
    input.socialJobs = [
      { id: 'j1', episode_id: 'missing-ep', platform: 'x', language_code: 'en', status: 'queued', scheduled_at: '2026-09-05T08:00:00Z', next_attempt_at: '2026-09-05T08:00:00Z', attempt_count: 0, lease_owner: null, lease_expires_at: null, last_error: null, completed_at: null, created_at: '2026-09-05T04:00:00Z', updated_at: '2026-09-05T04:00:00Z' },
      { id: 'j2', episode_id: EP_A, platform: 'unknown', language_code: 'en', status: 'queued', scheduled_at: '2026-09-05T08:00:00Z', next_attempt_at: '2026-09-05T08:00:00Z', attempt_count: 0, lease_owner: null, lease_expires_at: null, last_error: null, completed_at: null, created_at: '2026-09-05T04:00:00Z', updated_at: '2026-09-05T04:00:00Z' },
    ];
    const res = buildPipelineQueues(input);
    expect(res.social.queued).toHaveLength(0);
    expect(res.social.attention).toHaveLength(0);
  });
});
