import { EPISODE_VIDEO_VISUAL_VERSION } from '@zapengine/types/shared';
import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import {
  createPodcastPipelineService,
  summarizePodcastPipeline,
} from './podcast-pipeline.js';

const configured = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('./supabase.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./supabase.js')>();
  return {
    ...actual,
    createConfiguredServiceRoleClient: () => configured.client,
  };
});

const EPISODE = {
  id: '826f4b87-6278-4275-bff5-535ba5ef438d',
  source_title: 'Title',
  source_url: 'https://example.com/a',
  created_at: '2026-08-31T15:54:10.000Z',
};
const NOW = new Date('2026-09-01T00:00:00.000Z');

function thenable(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'eq', 'order', 'limit']) {
    chain[m] = () => chain;
  }
  chain['then'] = (
    ok: (v: unknown) => unknown,
    bad?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(ok, bad);
  return chain;
}

function fullClient(
  overrides: Record<string, { data: unknown; error: unknown }> = {},
) {
  const tables: Record<string, { data: unknown; error: unknown }> = {
    episodes: { data: [EPISODE], error: null },
    podcast_ingest_jobs: { data: [], error: null },
    episode_localizations: { data: [], error: null },
    episode_video_visuals: { data: [], error: null },
    episode_videos: { data: [], error: null },
    ops_pipeline_runs: { data: [], error: null },
    ...overrides,
  };
  return {
    from: vi.fn((table: string) =>
      thenable(tables[table] ?? { data: [], error: null }),
    ),
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  };
}

function loc(lang: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `id-${lang}`,
    episode_id: EPISODE.id,
    language_code: lang,
    status: 'completed',
    script: `${lang} script`,
    hls_url: `https://cdn.example/${lang}.m3u8`,
    classroom_hls_url:
      lang === 'zh-Hant' ? 'https://cdn.example/class.m3u8' : null,
    updated_at: '2026-08-31T16:00:00.000Z',
    ...overrides,
  };
}

function svcWith(client: unknown) {
  configured.client = client;
  return createPodcastPipelineService({
    config: readControlCenterConfig({
      SUPABASE_URL: 'https://x.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    }),
  });
}

describe('podcast pipeline coverage round 2', () => {
  it('throws when a dependent query fails', async () => {
    const client = fullClient({
      episode_localizations: { data: null, error: new Error('loc down') },
    });
    const res = await svcWith(client).getPipeline();
    expect(res.status).toBe('error');
    expect(res.message).toBe('loc down');
  });

  it('throws when the history read fails hard', async () => {
    let ingestCalls = 0;
    const client = fullClient();
    const from = client.from as ReturnType<typeof vi.fn>;
    from.mockImplementation(((table: string) => {
      if (table === 'podcast_ingest_jobs' && ++ingestCalls === 2) {
        return thenable({ data: null, error: new Error('history down') });
      }
      return thenable({
        data: table === 'episodes' ? [EPISODE] : [],
        error: null,
      });
    }) as never);
    const res = await svcWith(client).getPipeline();
    expect(res.status).toBe('error');
    expect(res.message).toBe('history down');
  });

  it('attaches failure history and abandon columns on success', async () => {
    let ingestCalls = 0;
    const base: Record<string, { data: unknown; error: unknown }> = {
      episodes: { data: [EPISODE], error: null },
      episode_localizations: { data: [], error: null },
      episode_video_visuals: {
        data: [
          {
            episode_id: EPISODE.id,
            status: 'queued',
            progress_percent: null,
            progress_stage: null,
            attempt_count: 0,
            lease_expires_at: null,
            last_error: null,
            visual_payload: null,
            visual_version: EPISODE_VIDEO_VISUAL_VERSION,
            updated_at: '2026-08-31T20:00:00Z',
          },
        ],
        error: null,
      },
      episode_videos: { data: [], error: null },
      ops_pipeline_runs: { data: [], error: null },
    };
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'podcast_ingest_jobs') {
          ingestCalls += 1;
          if (ingestCalls === 1) {
            return thenable({
              data: [
                {
                  source_url: EPISODE.source_url,
                  status: 'queued',
                  attempt_count: 0,
                  lease_expires_at: null,
                  last_error: null,
                  updated_at: '2026-08-31T20:00:00Z',
                },
              ],
              error: null,
            });
          }
          return thenable({
            data: [
              {
                source_url: EPISODE.source_url,
                failure_history: [
                  { kind: 'failed', at: '2026-08-31T20:00:00Z', attempt: 1 },
                ],
              },
            ],
            error: null,
          });
        }
        if (table === 'episode_video_visuals' && ingestCalls >= 2) {
          return thenable({
            data: [
              {
                episode_id: EPISODE.id,
                abandoned_at: '2026-09-01T00:00:00Z',
                abandoned_reason: 'done',
              },
            ],
            error: null,
          });
        }
        return thenable(base[table] ?? { data: [], error: null });
      }),
      rpc: vi.fn(),
    };
    const res = await svcWith(client).getPipeline();
    expect(res.status).toBe('ok');
    expect(res.episodes[0]?.ingest?.failureHistory).toHaveLength(1);
    expect(res.episodes[0]?.abandoned).toMatchObject({ reason: 'done' });
  });

  it('throws when the abandon read fails hard', async () => {
    const client = fullClient();
    let visualsCalls = 0;
    const from = client.from as ReturnType<typeof vi.fn>;
    const orig = from.getMockImplementation();
    from.mockImplementation(((table: string) => {
      if (table === 'episode_video_visuals') {
        visualsCalls += 1;
        if (visualsCalls === 2) {
          return thenable({ data: null, error: new Error('abandon down') });
        }
      }
      return (orig as (...a: never[]) => unknown)(table as never) as never;
    }) as never);
    const res = await svcWith(client).getPipeline();
    expect(res.status).toBe('error');
    expect(res.message).toBe('abandon down');
  });

  it('restartVideo and restartRender surface rpc and empty-data failures', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: new Error('video rpc down') })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    configured.client = { from: vi.fn(), rpc };
    const svc = svcWith(configured.client);
    await expect(svc.restartVideo(EPISODE.id)).rejects.toThrow(
      'video rpc down',
    );
    await expect(svc.restartRender(EPISODE.id, 'loc')).rejects.toThrow(
      'Render retry changed no episode',
    );
  });

  it('applies queued and processing ingest status onto pending bases', () => {
    for (const status of ['queued', 'processing'] as const) {
      const [summary] = summarizePodcastPipeline(
        [EPISODE],
        [
          {
            source_url: EPISODE.source_url,
            status,
            attempt_count: 0,
            lease_expires_at:
              status === 'processing' ? '2026-09-01T01:00:00Z' : null,
            last_error: null,
            updated_at: '2026-08-31T20:00:00Z',
          } as never,
        ],
        [],
        [],
        [],
        NOW,
      );
      expect(summary?.translationStatus).toBe(status);
    }
  });

  it('reports stuck and completed video states', () => {
    const stuck = summarizePodcastPipeline(
      [EPISODE],
      [],
      [loc('zh-Hant'), loc('ja'), loc('en')],
      [
        {
          episode_id: EPISODE.id,
          status: 'processing',
          attempt_count: 1,
          lease_expires_at: '2026-08-01T00:00:00Z',
          last_error: null,
          updated_at: '2026-08-31T20:00:00Z',
          visual_payload: null,
          visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        } as never,
      ],
      [],
      NOW,
    )[0];
    expect(stuck?.videoStatus).toBe('stuck');
    const done = summarizePodcastPipeline(
      [EPISODE],
      [],
      [loc('zh-Hant'), loc('ja'), loc('en')],
      [
        {
          episode_id: EPISODE.id,
          status: 'completed',
          attempt_count: 1,
          lease_expires_at: null,
          last_error: null,
          updated_at: '2026-08-31T20:00:00Z',
          visual_payload: null,
          visual_version: EPISODE_VIDEO_VISUAL_VERSION,
        } as never,
      ],
      (['zh-Hant', 'ja', 'en'] as const).map(
        (lang) =>
          ({
            episode_localization_id: `id-${lang}`,
            episode_id: EPISODE.id,
            status: 'completed',
            progress_percent: null,
            progress_stage: null,
            attempt_count: 1,
            lease_expires_at: null,
            last_error: null,
            updated_at: '2026-08-31T20:00:00Z',
            visual_version: EPISODE_VIDEO_VISUAL_VERSION,
          }) as never,
      ),
      NOW,
    )[0];
    expect(done?.videoStatus).toBe('completed');
  });

  it('falls back to pending for unknown job statuses', () => {
    const [summary] = summarizePodcastPipeline(
      [EPISODE],
      [
        {
          source_url: EPISODE.source_url,
          status: 'weird',
          attempt_count: 0,
          lease_expires_at: null,
          last_error: null,
          updated_at: '2026-08-31T20:00:00Z',
        } as never,
      ],
      [],
      [],
      [],
      NOW,
    );
    expect(summary?.ingest?.status).toBe('pending');
  });
});
