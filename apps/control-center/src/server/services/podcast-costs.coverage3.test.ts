import { afterEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { createPodcastCostService } from './podcast-costs.js';

afterEach(() => vi.unstubAllGlobals());

function configured() {
  return readControlCenterConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  });
}

describe('podcast costs episode-id dedup coverage', () => {
  it('skips null and duplicate episode ids and stops at the 25-episode limit', async () => {
    const distinct = Array.from({ length: 30 }, (_, i) => `ep-${i}`);
    const firstPage = [
      {
        id: 'run-null',
        pipeline: 'ingest',
        episode_id: null,
        status: 'completed',
        started_at: '2026-09-01T00:00:00Z',
      },
      {
        id: 'run-dup-a',
        pipeline: 'ingest',
        episode_id: 'ep-0',
        status: 'completed',
        started_at: '2026-09-01T01:00:00Z',
      },
      {
        id: 'run-dup-b',
        pipeline: 'ingest',
        episode_id: 'ep-0',
        status: 'completed',
        started_at: '2026-09-01T02:00:00Z',
      },
      ...distinct.map((episode_id, i) => ({
        id: `run-${i}`,
        pipeline: 'ingest',
        episode_id,
        status: 'completed',
        started_at: `2026-09-01T${String(3 + (i % 20)).padStart(2, '0')}:00:00Z`,
      })),
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = new URL(String(input));
        const table = url.pathname.split('/').at(-1)!;
        if (table === 'ops_pipeline_runs') {
          return Response.json(firstPage);
        }
        if (table === 'ops_pipeline_stage_runs') {
          return Response.json([]);
        }
        if (table === 'episodes') {
          return Response.json([]);
        }
        return Response.json([]);
      }),
    );

    const result = await createPodcastCostService({
      config: configured(),
    }).getPodcastCosts();

    expect(result.status).toBe('ok');
    // Discovery stops at 25 distinct episodes despite 30+ rows on the page.
    expect(result.episodes).toHaveLength(25);
    // The null row and the duplicate never become episode ids.
    const ids = result.episodes.map((e) => e.episodeId);
    expect(new Set(ids).size).toBe(25);
    expect(result).toMatchObject({
      scope: { episodeCount: 25 },
    });
  });
});
