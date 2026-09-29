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

function svcWith(client: unknown) {
  configured.client = client;
  return createPodcastPipelineService({
    config: readControlCenterConfig({
      SUPABASE_URL: 'https://x.co',
      SUPABASE_SERVICE_ROLE_KEY: 'k',
    }),
  });
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

describe('podcast pipeline coverage round 4', () => {
  it('returns an empty pipeline when the episode payload is null', async () => {
    configured.client = {
      from: vi.fn(() => thenable({ data: null, error: null })),
      rpc: vi.fn(),
    };
    const res = await svcWith(configured.client).getPipeline();
    expect(res).toMatchObject({ status: 'ok', episodes: [] });
  });

  it('tolerates null data payloads across every dependent query', async () => {
    const client = {
      from: vi.fn((table: string) =>
        thenable({
          data: table === 'episodes' ? [EPISODE] : null,
          error: null,
        }),
      ),
      rpc: vi.fn(),
    };
    const res = await svcWith(client).getPipeline();
    expect(res.status).toBe('ok');
    expect(res.episodes).toHaveLength(1);
    expect(res.episodes[0]?.ingest).toBeNull();
  });

  it('defaults failure history when the history map misses the source', async () => {
    let ingestCalls = 0;
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
          return thenable({ data: [], error: null });
        }
        if (table === 'episodes') {
          return thenable({ data: [EPISODE], error: null });
        }
        return thenable({ data: [], error: null });
      }),
      rpc: vi.fn(),
    };
    const res = await svcWith(client).getPipeline();
    expect(res.status).toBe('ok');
    expect(res.episodes[0]?.ingest?.failureHistory).toEqual([]);
  });

  it('defaults abandon columns when the abandon map misses the episode', async () => {
    let visualsCalls = 0;
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'episodes') {
          return thenable({ data: [EPISODE], error: null });
        }
        if (table === 'episode_video_visuals') {
          visualsCalls += 1;
          if (visualsCalls === 1) {
            return thenable({
              data: [
                {
                  episode_id: EPISODE.id,
                  status: 'queued',
                  attempt_count: 0,
                  lease_expires_at: null,
                  last_error: null,
                  updated_at: '2026-08-31T20:00:00Z',
                  visual_payload: null,
                  visual_version: EPISODE_VIDEO_VISUAL_VERSION,
                },
              ],
              error: null,
            });
          }
          return thenable({ data: [], error: null });
        }
        return thenable({ data: [], error: null });
      }),
      rpc: vi.fn(),
    };
    const res = await svcWith(client).getPipeline();
    expect(res.status).toBe('ok');
    expect(res.episodes[0]?.abandoned).toBeNull();
    expect(res.episodes[0]?.visual?.status).toBe('queued');
  });

  it('completes an ingest retry when the RPC reports a row', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    configured.client = { from: vi.fn(), rpc };
    await expect(
      svcWith(configured.client).restartIngest(EPISODE.id),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith(
      'restart_podcast_ingest',
      expect.objectContaining({ p_episode_id: EPISODE.id }),
    );
  });

  it('drops localizations whose language code is not supported', () => {
    const [summary] = summarizePodcastPipeline(
      [EPISODE],
      [],
      [
        {
          id: 'id-xx',
          episode_id: EPISODE.id,
          language_code: 'xx',
          status: 'completed',
          script: 'xx script',
          hls_url: 'https://cdn.example/xx.m3u8',
          classroom_hls_url: null,
          updated_at: '2026-08-31T16:00:00Z',
        } as never,
        loc('zh-Hant') as never,
      ],
      [],
      [],
      NOW,
    );
    expect(summary?.localizations.map((row) => row.languageCode)).toEqual([
      'zh-Hant',
    ]);
  });

  it('queues video when the visual is missing but queued renders exist', () => {
    const [summary] = summarizePodcastPipeline(
      [EPISODE],
      [],
      [loc('zh-Hant'), loc('ja'), loc('en')] as never,
      [],
      (['zh-Hant', 'ja', 'en'] as const).map(
        (lang) =>
          ({
            episode_localization_id: `id-${lang}`,
            episode_id: EPISODE.id,
            status: 'queued',
            progress_percent: null,
            progress_stage: null,
            attempt_count: 0,
            lease_expires_at: null,
            last_error: null,
            updated_at: '2026-08-31T20:00:00Z',
            visual_version: EPISODE_VIDEO_VISUAL_VERSION,
          }) as never,
      ),
      NOW,
    );
    expect(summary?.videoStatus).toBe('queued');
    expect(summary?.visual).toBeNull();
  });

  it('keeps the earlier row when a stale duplicate arrives late', () => {
    const [summary] = summarizePodcastPipeline(
      [EPISODE],
      [
        {
          source_url: EPISODE.source_url,
          status: 'failed',
          attempt_count: 2,
          lease_expires_at: null,
          last_error: 'newer',
          updated_at: '2026-08-31T22:00:00.000Z',
        } as never,
        {
          source_url: EPISODE.source_url,
          status: 'failed',
          attempt_count: 1,
          lease_expires_at: null,
          last_error: 'older',
          updated_at: '2026-08-31T20:00:00.000Z',
        } as never,
      ],
      [],
      [],
      [],
      NOW,
    );
    expect(summary?.ingest?.lastError).toBe('newer');
  });

  it('reports an unavailable pipeline when the failure is not an Error', async () => {
    configured.client = {
      from: vi.fn(() => thenable({ data: null, error: 'boom' })),
      rpc: vi.fn(),
    };
    const res = await svcWith(configured.client).getPipeline();
    expect(res).toMatchObject({
      status: 'error',
      message: 'Podcast pipeline state unavailable',
      episodes: [],
    });
  });
});
