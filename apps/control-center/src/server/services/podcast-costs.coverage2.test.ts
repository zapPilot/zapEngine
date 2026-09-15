import { afterEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import {
  createPodcastCostService,
  summarizePodcastCosts,
} from './podcast-costs.js';

afterEach(() => vi.unstubAllGlobals());

function configured() {
  return readControlCenterConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  });
}

describe('podcast costs coverage round 2', () => {
  it('skips discovery rows without an episode id', () => {
    const runs = [
      {
        id: 'r1',
        pipeline: 'ingest' as const,
        episode_id: 'ep-1',
        status: 'completed' as const,
        started_at: '2026-08-28T01:00:00Z',
      },
    ];
    const [episode] = summarizePodcastCosts(runs, [], new Map([['ep-1', 'T']]));
    expect(episode?.runCount).toBe(1);
  });

  it('fails the run page read through requirePage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('ops_pipeline_runs')) {
          return new Response(
            JSON.stringify({ message: 'runs down', code: 'XX01' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return Response.json([]);
      }),
    );
    const result = await createPodcastCostService({
      config: configured(),
    }).getPodcastCosts();
    expect(result.status).toBe('error');
    expect(result.message).toContain('XX01');
  });

  it('fails the stage page read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const table = url.pathname.split('/').at(-1)!;
        if (table === 'ops_pipeline_runs') {
          const select = url.searchParams.get('select');
          return Response.json(
            select === 'episode_id'
              ? [{ episode_id: 'ep-1' }]
              : [
                  {
                    id: 'run-1',
                    episode_id: 'ep-1',
                    pipeline: 'ingest',
                    status: 'completed',
                    started_at: '2026-09-01T00:00:00Z',
                  },
                ],
          );
        }
        if (table === 'ops_pipeline_stage_runs') {
          return new Response(
            JSON.stringify({ message: 'stages down', code: 'XX02' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return Response.json([]);
      }),
    );
    const result = await createPodcastCostService({
      config: configured(),
    }).getPodcastCosts();
    expect(result.status).toBe('error');
    expect(result.message).toContain('XX02');
  });

  it('skips stages whose episode has no run summary', () => {
    const runs = [
      {
        id: 'r1',
        pipeline: 'ingest' as const,
        episode_id: 'ep-1',
        status: 'completed' as const,
        started_at: '2026-08-28T01:00:00Z',
      },
    ];
    const stages = [
      {
        run_id: 'r1',
        episode_id: 'ep-ghost',
        language_code: 'en',
        stage: 's',
        status: 'completed' as const,
        estimated_cost_usd: 0.5,
        pricing_basis: 'rate_card' as const,
      },
    ];
    const [episode] = summarizePodcastCosts(runs, stages, new Map());
    expect(episode?.totalCostUsd).toBe(0);
  });

  it('stops discovery after collecting 25 episodes', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => ({
      episode_id: `ep-${i}`,
    }));
    const seen: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const table = url.pathname.split('/').at(-1)!;
        if (table === 'ops_pipeline_runs') {
          const select = url.searchParams.get('select');
          if (!select || select === 'episode_id') {
            return Response.json(ids);
          }
          const episodeIds = url.searchParams.get('episode_id') ?? '';
          const list = episodeIds
            .replace(/[()]/g, '')
            .split(',')
            .filter(Boolean);
          seen.push(list.length);
          return Response.json(
            list
              .slice(0, 1)
              .map((id) => ({
                id: `run-${id}`,
                episode_id: id,
                pipeline: 'ingest',
                status: 'completed',
                started_at: '2026-09-01T00:00:00Z',
              })),
          );
        }
        if (table === 'ops_pipeline_stage_runs') {
          return Response.json([]);
        }
        if (table === 'episodes') {
          const filter = url.searchParams.get('id') ?? '';
          return Response.json(
            filter
              .replace(/[()]/g, '')
              .split(',')
              .filter(Boolean)
              .map((id) => ({ id, source_title: id })),
          );
        }
        return Response.json([]);
      }),
    );
    const result = await createPodcastCostService({
      config: configured(),
    }).getPodcastCosts();
    expect(result.status).toBe('ok');
    expect(result.episodes.length).toBeLessThanOrEqual(25);
  });
});
