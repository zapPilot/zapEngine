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

function runRow(id: string, episodeId: string | null) {
  return {
    id,
    pipeline: 'ingest',
    episode_id: episodeId,
    status: 'completed',
    started_at: '2026-09-01T00:00:00Z',
  };
}

describe('podcast costs coverage round 4', () => {
  it('treats a null episode payload as untitled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const table = url.pathname.split('/').at(-1)!;
        if (table === 'ops_pipeline_runs') {
          const filter = url.searchParams.get('episode_id') ?? '';
          if (filter.startsWith('in.')) {
            return Response.json([
              {
                id: 'run-1',
                episode_id: 'ep-1',
                pipeline: 'ingest',
                status: 'completed',
                started_at: '2026-09-01T00:00:00Z',
              },
            ]);
          }
          return Response.json([runRow('run-1', 'ep-1')]);
        }
        if (table === 'ops_pipeline_stage_runs') {
          return Response.json([]);
        }
        if (table === 'episodes') {
          return Response.json(null);
        }
        return Response.json([]);
      }),
    );
    const result = await createPodcastCostService({
      config: configured(),
    }).getPodcastCosts();
    expect(result.status).toBe('ok');
    expect(result.episodes[0]?.title).toBeNull();
  });

  it('continues discovery past a full run page', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const table = url.pathname.split('/').at(-1)!;
        if (table === 'ops_pipeline_runs') {
          const filter = url.searchParams.get('episode_id') ?? '';
          if (filter.startsWith('in.')) {
            return Response.json([
              {
                id: 'run-ep-0',
                episode_id: 'ep-0',
                pipeline: 'ingest',
                status: 'completed',
                started_at: '2026-09-01T00:00:00Z',
              },
            ]);
          }
          calls += 1;
          if (calls === 1) {
            return Response.json(
              Array.from({ length: 500 }, (_, i) => runRow(`run-${i}`, 'ep-0')),
            );
          }
          return Response.json([]);
        }
        if (table === 'ops_pipeline_stage_runs') {
          return Response.json([]);
        }
        if (table === 'episodes') {
          return Response.json([{ id: 'ep-0', source_title: 'Ep' }]);
        }
        return Response.json([]);
      }),
    );
    const result = await createPodcastCostService({
      config: configured(),
    }).getPodcastCosts();
    expect(result.status).toBe('ok');
    expect(calls).toBe(2);
    expect(result.episodes[0]?.episodeId).toBe('ep-0');
  });

  it('reports a ledger failure without a code as a plain message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const table = url.pathname.split('/').at(-1)!;
        if (table === 'ops_pipeline_runs') {
          return new Response(JSON.stringify({ message: 'plain failure' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return Response.json([]);
      }),
    );
    const result = await createPodcastCostService({
      config: configured(),
    }).getPodcastCosts();
    expect(result.status).toBe('error');
    expect(result.message).toBe('plain failure');
  });

  it('treats a null run page as an empty ledger', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const table = url.pathname.split('/').at(-1)!;
        if (table === 'ops_pipeline_runs') {
          return Response.json(null);
        }
        return Response.json([]);
      }),
    );
    const result = await createPodcastCostService({
      config: configured(),
    }).getPodcastCosts();
    expect(result.status).toBe('ok');
    expect(result.episodes).toEqual([]);
  });

  it('loads every run page for a selected episode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const table = url.pathname.split('/').at(-1)!;
        if (table === 'ops_pipeline_runs') {
          const filter = url.searchParams.get('episode_id') ?? '';
          if (filter.startsWith('in.')) {
            const offset = Number(url.searchParams.get('offset') ?? 0);
            if (offset === 0) {
              return Response.json(
                Array.from({ length: 500 }, (_, i) => ({
                  id: `run-${i}`,
                  episode_id: 'ep-1',
                  pipeline: 'ingest',
                  status: 'completed',
                  started_at: '2026-09-01T00:00:00Z',
                })),
              );
            }
            return Response.json([]);
          }
          return Response.json([runRow('run-disc', 'ep-1')]);
        }
        if (table === 'ops_pipeline_stage_runs') {
          return Response.json([]);
        }
        if (table === 'episodes') {
          return Response.json([{ id: 'ep-1', source_title: 'Ep' }]);
        }
        return Response.json([]);
      }),
    );
    const result = await createPodcastCostService({
      config: configured(),
    }).getPodcastCosts();
    expect(result.status).toBe('ok');
    expect(result.episodes[0]?.runCount).toBe(500);
  });

  it('treats a null stage page as no stages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const table = url.pathname.split('/').at(-1)!;
        if (table === 'ops_pipeline_runs') {
          const filter = url.searchParams.get('episode_id') ?? '';
          if (filter.startsWith('in.')) {
            return Response.json([
              {
                id: 'run-1',
                episode_id: 'ep-1',
                pipeline: 'ingest',
                status: 'completed',
                started_at: '2026-09-01T00:00:00Z',
              },
            ]);
          }
          return Response.json([runRow('run-1', 'ep-1')]);
        }
        if (table === 'ops_pipeline_stage_runs') {
          return Response.json(null);
        }
        if (table === 'episodes') {
          return Response.json([{ id: 'ep-1', source_title: 'Ep' }]);
        }
        return Response.json([]);
      }),
    );
    const result = await createPodcastCostService({
      config: configured(),
    }).getPodcastCosts();
    expect(result.status).toBe('ok');
    expect(result.episodes[0]?.totalCostUsd).toBe(0);
  });

  it('skips stages that resolve to no episode', () => {
    const runs = [
      {
        id: 'r-null',
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
        run_id: 'r-null',
        episode_id: null,
        language_code: 'en',
        stage: 's',
        status: 'completed' as const,
        estimated_cost_usd: 0.5,
        pricing_basis: 'rate_card' as const,
      },
    ];
    const [episode] = summarizePodcastCosts(runs, stages, new Map());
    expect(episode?.totalCostUsd).toBe(0);
    expect(episode?.runCount).toBe(1);
  });

  it('leaves retry waste empty when the predecessor is unknown', () => {
    const runs = [
      {
        id: 'r1',
        pipeline: 'video_render' as const,
        episode_id: 'ep-1',
        status: 'completed' as const,
        started_at: '2026-09-09T01:00:00Z',
      },
    ];
    const stages = [
      {
        run_id: 'r1',
        episode_id: 'ep-1',
        language_code: null,
        stage: 'render',
        status: 'completed' as const,
        estimated_cost_usd: 0.1,
        pricing_basis: 'rate_card' as const,
        execution_id: null,
        previous_execution_id: 'exec-missing',
        work_key: 'w',
        execution_mode: 'executed' as const,
        failure_reason: null,
      },
    ];
    const [episode] = summarizePodcastCosts(
      runs,
      stages as never,
      new Map([['ep-1', null]]),
    );
    expect(episode?.confirmedRetryWasteUsd).toBeNull();
    expect(episode?.unknownLineageStages).toBe(1);
  });

  it('labels ingest costs by stage when no language applies', () => {
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
        episode_id: 'ep-1',
        language_code: null,
        stage: 'transcribe',
        status: 'completed' as const,
        estimated_cost_usd: 0.2,
        pricing_basis: 'rate_card' as const,
      },
    ];
    const [episode] = summarizePodcastCosts(runs, stages, new Map());
    expect(episode?.breakdown).toEqual([
      { label: 'transcribe', costUsd: 0.2, operations: 1 },
    ]);
  });
});
