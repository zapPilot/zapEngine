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

function stubTables(
  handlers: Record<string, (url: URL) => unknown>,
  fallback?: (url: URL) => unknown,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      const table = url.pathname.split('/').at(-1)!;
      const handler = handlers[table] ?? fallback;
      if (!handler) {
        throw new Error(`Unexpected table ${table}`);
      }
      return Response.json(handler(url));
    }),
  );
}

describe('podcast costs coverage', () => {
  it('returns unconfigured without Supabase', async () => {
    const service = createPodcastCostService({
      config: readControlCenterConfig({}),
    });
    const result = await service.getPodcastCosts();
    expect(result.status).toBe('unconfigured');
    expect(result.episodes).toEqual([]);
  });

  it('returns ok with empty episodes when no runs exist', async () => {
    stubTables({ ops_pipeline_runs: () => [] });
    const result = await createPodcastCostService({
      config: configured(),
    }).getPodcastCosts();
    expect(result.status).toBe('ok');
    expect(result.episodes).toEqual([]);
  });

  it('maps an episode lookup failure to an error with the PostgREST code', async () => {
    stubTables({
      ops_pipeline_runs: (url) =>
        url.searchParams.get('select') === 'episode_id'
          ? [{ episode_id: 'ep-1' }]
          : [
              {
                id: 'run-1',
                episode_id: 'ep-1',
                pipeline: 'video_render',
                status: 'completed',
                started_at: '2026-09-01T00:00:00Z',
              },
            ],
      ops_pipeline_stage_runs: () => [],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const table = url.pathname.split('/').at(-1)!;
        if (table === 'episodes') {
          return new Response(
            JSON.stringify({ message: 'relation missing', code: '42P01' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (table === 'ops_pipeline_runs') {
          const select = url.searchParams.get('select');
          return Response.json(
            select === 'episode_id'
              ? [{ episode_id: 'ep-1' }]
              : [
                  {
                    id: 'run-1',
                    episode_id: 'ep-1',
                    pipeline: 'video_render',
                    status: 'completed',
                    started_at: '2026-09-01T00:00:00Z',
                  },
                ],
          );
        }
        return Response.json([]);
      }),
    );
    const result = await createPodcastCostService({
      config: configured(),
    }).getPodcastCosts();
    expect(result.status).toBe('error');
    expect(result.message).toContain('42P01');
  });

  it('skips runs and stages that cannot be attributed to an episode', () => {
    const runs = [
      {
        id: 'orphan',
        pipeline: 'ingest' as const,
        episode_id: null,
        status: 'completed' as const,
        started_at: '2026-08-28T01:00:00Z',
      },
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
        run_id: 'missing-run',
        episode_id: 'ep-1',
        language_code: 'en',
        stage: 's',
        status: 'completed' as const,
        estimated_cost_usd: 0.1,
        pricing_basis: 'rate_card' as const,
      },
      {
        run_id: 'r1',
        episode_id: null,
        language_code: 'en',
        stage: 's',
        status: 'completed' as const,
        estimated_cost_usd: 'bogus',
        pricing_basis: 'rate_card' as const,
      },
      {
        run_id: 'r1',
        episode_id: 'ep-1',
        language_code: 'en',
        stage: 's',
        status: 'completed' as const,
        estimated_cost_usd: 0.2,
        pricing_basis: 'rate_card' as const,
      },
    ];
    const [episode] = summarizePodcastCosts(
      runs,
      stages,
      new Map([['ep-1', null]]),
    );
    expect(episode?.totalCostUsd).toBeCloseTo(0.2, 8);
    expect(episode?.title).toBeNull();
  });

  it('tracks deploy_shutdown vs shutdown interruptions separately', () => {
    const runs = [
      {
        id: 'r1',
        pipeline: 'video_render' as const,
        episode_id: 'ep-1',
        status: 'failed' as const,
        started_at: '2026-08-28T01:00:00Z',
      },
    ];
    const stages = [
      {
        run_id: 'r1',
        episode_id: 'ep-1',
        language_code: null,
        stage: 'render',
        status: 'failed' as const,
        estimated_cost_usd: 0.3,
        pricing_basis: 'rate_card' as const,
        failure_reason: 'deploy_shutdown',
      },
      {
        run_id: 'r1',
        episode_id: 'ep-1',
        language_code: null,
        stage: 'render',
        status: 'failed' as const,
        estimated_cost_usd: 0.2,
        pricing_basis: 'rate_card' as const,
        failure_reason: 'shutdown',
      },
    ];
    const [episode] = summarizePodcastCosts(runs, stages as never, new Map());
    expect(episode?.interruptedAttemptCostUsd).toBeCloseTo(0.5, 8);
    expect(episode?.confirmedDeploymentInterruptionCostUsd).toBeCloseTo(0.3, 8);
    expect(episode?.shutdownInterruptionCostUsd).toBeCloseTo(0.2, 8);
  });

  it('counts unknown lineage only for costed video renders without execution id', () => {
    const runs = [
      {
        id: 'r1',
        pipeline: 'video_render' as const,
        episode_id: 'ep-1',
        status: 'completed' as const,
        started_at: '2026-08-28T01:00:00Z',
      },
    ];
    const stages = [
      {
        run_id: 'r1',
        episode_id: 'ep-1',
        language_code: null,
        stage: 'render',
        status: 'completed' as const,
        estimated_cost_usd: null,
        pricing_basis: 'unpriced' as const,
      },
      {
        run_id: 'r1',
        episode_id: 'ep-1',
        language_code: 'en',
        stage: 'render',
        status: 'completed' as const,
        estimated_cost_usd: 0.1,
        pricing_basis: 'rate_card' as const,
        execution_id: 'exec-1',
        work_key: 'w',
        previous_execution_id: null,
        execution_mode: null,
      },
    ];
    const [episode] = summarizePodcastCosts(runs, stages as never, new Map());
    expect(episode?.unknownLineageStages).toBe(0);
    expect(episode?.unpricedStages).toBe(1);
  });

  it('sorts episodes by most recent run', () => {
    const runs = [
      {
        id: 'old',
        pipeline: 'ingest' as const,
        episode_id: 'ep-old',
        status: 'completed' as const,
        started_at: '2026-08-27T00:00:00Z',
      },
      {
        id: 'new',
        pipeline: 'ingest' as const,
        episode_id: 'ep-new',
        status: 'completed' as const,
        started_at: '2026-08-28T00:00:00Z',
      },
    ];
    const episodes = summarizePodcastCosts(runs, [], new Map());
    expect(episodes.map((e) => e.episodeId)).toEqual(['ep-new', 'ep-old']);
  });
});
