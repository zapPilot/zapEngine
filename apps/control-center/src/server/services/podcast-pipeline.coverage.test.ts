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

function serviceClient(
  tables: Record<string, { data: unknown; error: unknown }>,
  rpc = vi.fn(),
) {
  return {
    from: vi.fn((table: string) =>
      thenable(tables[table] ?? { data: [], error: null }),
    ),
    rpc,
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

describe('podcast pipeline coverage', () => {
  it('returns unconfigured without Supabase', async () => {
    configured.client = null;
    const svc = createPodcastPipelineService({
      config: readControlCenterConfig({}),
    });
    const res = await svc.getPipeline();
    expect(res.status).toBe('unconfigured');
    await expect(svc.restartIngest('x')).rejects.toThrow('not connected');
    await expect(svc.restartVideo('x')).rejects.toThrow('not connected');
    await expect(svc.restartRender('x', 'y')).rejects.toThrow('not connected');
  });

  it('returns an empty pipeline when no episodes exist', async () => {
    configured.client = serviceClient({ episodes: { data: [], error: null } });
    const res = await createPodcastPipelineService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    }).getPipeline();
    expect(res).toMatchObject({ status: 'ok', episodes: [] });
  });

  it('maps a query failure to an error pipeline', async () => {
    configured.client = serviceClient({
      episodes: { data: null, error: new Error('episodes down') },
    });
    const res = await createPodcastPipelineService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    }).getPipeline();
    expect(res.status).toBe('error');
    expect(res.message).toBe('episodes down');
  });

  it('tolerates a missing failure_history column and still summarizes', async () => {
    let ingestCalls = 0;
    const baseTables = {
      episodes: { data: [EPISODE], error: null },
      episode_localizations: { data: [loc('zh-Hant')], error: null },
      episode_video_visuals: { data: [], error: null },
      episode_videos: { data: [], error: null },
      ops_pipeline_runs: { data: [], error: null },
    };
    configured.client = {
      from: vi.fn((table: string) => {
        if (table === 'podcast_ingest_jobs') {
          ingestCalls += 1;
          if (ingestCalls === 1) {
            return thenable({ data: [], error: null });
          }
          return thenable({
            data: null,
            error: { code: '42703', message: 'no column' },
          });
        }
        return thenable(
          baseTables[table as keyof typeof baseTables] ?? {
            data: [],
            error: null,
          },
        );
      }),
      rpc: vi.fn(),
    };
    const res = await createPodcastPipelineService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    }).getPipeline();
    expect(res.status).toBe('ok');
  });

  it('restart rpcs surface transport and empty-data failures', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'rpc down' } })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    configured.client = serviceClient(
      { episodes: { data: [], error: null } },
      rpc,
    );
    const svc = createPodcastPipelineService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    });
    await expect(svc.restartIngest(EPISODE.id)).rejects.toMatchObject({
      message: 'rpc down',
    });
    await expect(svc.restartIngest(EPISODE.id)).rejects.toThrow(
      'changed no episode',
    );
    await expect(svc.restartVideo(EPISODE.id)).rejects.toThrow(
      'changed no episode',
    );
  });

  it('sends force_replan only when requested and validates render retries', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    configured.client = serviceClient({}, rpc);
    const svc = createPodcastPipelineService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    });
    await svc.restartVideo(EPISODE.id, { forceReplan: true });
    expect(rpc).toHaveBeenCalledWith(
      'retry_episode_video_generation',
      expect.objectContaining({ p_force_replan: true }),
    );
    await svc.restartRender(EPISODE.id, 'loc-1');
    expect(rpc).toHaveBeenCalledWith(
      'retry_episode_video_render',
      expect.objectContaining({
        p_visual_version: EPISODE_VIDEO_VISUAL_VERSION,
      }),
    );
  });

  it('marks abandoned episodes done and disables restarts', () => {
    const [summary] = summarizePodcastPipeline(
      [EPISODE],
      [],
      [loc('zh-Hant'), loc('ja'), loc('en')],
      [
        {
          episode_id: EPISODE.id,
          status: 'failed',
          attempt_count: 1,
          lease_expires_at: null,
          last_error: 'x',
          updated_at: '2026-08-31T20:00:00Z',
          visual_payload: null,
          visual_version: EPISODE_VIDEO_VISUAL_VERSION,
          abandoned_at: '2026-09-01T00:00:00Z',
          abandoned_reason: '  ',
        } as never,
      ],
      [],
      NOW,
    );
    expect(summary?.videoStatus).toBe('abandoned');
    expect(summary?.currentPhase).toBe('done');
    expect(summary?.abandoned).toMatchObject({ reason: 'No reason recorded' });
    expect(summary?.canRestartVideo).toBe(false);
  });

  it('parses only well-formed ingest failure history entries', () => {
    const [summary] = summarizePodcastPipeline(
      [EPISODE],
      [
        {
          source_url: EPISODE.source_url,
          status: 'failed',
          attempt_count: 1,
          lease_expires_at: null,
          last_error: 'bad',
          updated_at: '2026-09-01T00:00:00Z',
          failure_history: [
            {
              kind: 'failed',
              at: '2026-09-01T00:00:00Z',
              attempt: 1,
              owner: 'w',
              error: 'e',
            },
            'junk',
            { kind: 'nope', at: 'x', attempt: 1 },
          ],
        } as never,
      ],
      [],
      [],
      [],
      NOW,
    );
    expect(summary?.ingest?.failureHistory).toHaveLength(1);
    expect(summary?.translationStatus).toBe('failed');
  });

  it('treats processing with an expired lease as stuck and stale versions as stale', () => {
    const [summary] = summarizePodcastPipeline(
      [EPISODE],
      [
        {
          source_url: EPISODE.source_url,
          status: 'processing',
          attempt_count: 1,
          lease_expires_at: '2026-08-01T00:00:00Z',
          last_error: null,
          updated_at: '2026-08-31T00:00:00Z',
        } as never,
      ],
      [loc('zh-Hant'), loc('ja'), loc('en')],
      [
        {
          episode_id: EPISODE.id,
          status: 'queued',
          attempt_count: 0,
          lease_expires_at: null,
          last_error: null,
          updated_at: '2026-08-31T00:00:00Z',
          visual_payload: null,
          visual_version: 'v0',
        } as never,
      ],
      [],
      NOW,
    );
    expect(summary?.ingest?.status).toBe('stuck');
    expect(summary?.visual?.status).toBe('stale');
  });

  it('covers translation/tts/video phase edges', () => {
    const noLoc = summarizePodcastPipeline([EPISODE], [], [], [], [], NOW)[0];
    expect(noLoc?.translationStatus).toBe('pending');
    expect(noLoc?.currentPhase).toBe('translation');
    const partial = summarizePodcastPipeline(
      [EPISODE],
      [],
      [{ ...loc('zh-Hant'), script: '' }],
      [],
      [],
      NOW,
    )[0];
    expect(partial?.translationStatus).toBe('processing');
  });
});
