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
    createConfiguredServiceRoleClient: vi.fn(() => configured.client),
  };
});

const NOW = new Date('2026-09-01T00:00:00.000Z');
const EPISODE = {
  id: '826f4b87-6278-4275-bff5-535ba5ef438d',
  source_title: 'T',
  source_url: 'https://example.com/article',
  created_at: '2026-08-31T15:54:10.000Z',
};

describe('podcast pipeline coverage gaps', () => {
  it('surfaces a restartRender RPC error', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'render rpc down' } });
    configured.client = { from: vi.fn(), rpc };
    const svc = createPodcastPipelineService({
      config: readControlCenterConfig({
        SUPABASE_URL: 'https://x.co',
        SUPABASE_SERVICE_ROLE_KEY: 'k',
      }),
    });

    await expect(
      svc.restartRender(EPISODE.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    ).rejects.toMatchObject({ message: 'render rpc down' });
    expect(rpc).toHaveBeenCalledWith(
      'retry_episode_video_render',
      expect.objectContaining({ p_episode_id: EPISODE.id }),
    );
  });

  it('keeps the latest ingest and legacy rows by timestamp', () => {
    const [summary] = summarizePodcastPipeline(
      [EPISODE],
      [
        {
          source_url: EPISODE.source_url,
          status: 'failed',
          attempt_count: 1,
          lease_expires_at: null,
          last_error: 'old',
          updated_at: '2026-08-31T20:00:00.000Z',
        },
        {
          source_url: EPISODE.source_url,
          status: 'failed',
          attempt_count: 2,
          lease_expires_at: null,
          last_error: 'new',
          updated_at: '2026-08-31T22:00:00.000Z',
        },
      ] as never,
      [],
      [],
      [],
      NOW,
      [
        {
          episode_id: EPISODE.id,
          status: 'completed',
          finished_at: '2026-08-30T00:00:00Z',
          created_at: '2026-08-29T00:00:00Z',
        },
        {
          episode_id: EPISODE.id,
          status: 'completed',
          finished_at: '2026-08-31T00:00:00Z',
          created_at: '2026-08-29T00:00:00Z',
        },
        {
          episode_id: null,
          status: 'completed',
          finished_at: null,
          created_at: '2026-08-31T00:00:00Z',
        },
      ] as never,
    );

    // Newer ingest wins: its error surfaces on the summary.
    expect(summary?.ingest?.lastError).toBe('new');
    // Legacy rows collapse to the latest finished_at; the null-episode row is
    // filtered before the timestamp comparison runs.
    expect(summary?.ingest?.status).toBe('failed');
  });

  it('falls back to created_at when legacy finished_at is null', () => {
    const [summary] = summarizePodcastPipeline([EPISODE], [], [], [], [], NOW, [
      {
        episode_id: EPISODE.id,
        status: 'completed',
        finished_at: null,
        created_at: '2026-08-29T00:00:00Z',
      },
      {
        episode_id: EPISODE.id,
        status: 'completed',
        finished_at: null,
        created_at: '2026-08-30T00:00:00Z',
      },
    ] as never);

    expect(summary?.ingest?.updatedAt).toBe('2026-08-30T00:00:00Z');
  });
});
