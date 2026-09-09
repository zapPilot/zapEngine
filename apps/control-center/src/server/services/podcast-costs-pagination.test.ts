import { afterEach, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { createPodcastCostService } from './podcast-costs.js';

afterEach(() => vi.unstubAllGlobals());

it('loads every stage page in a stable order without clipping episode cost history', async () => {
  const offsets: number[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      const table = url.pathname.split('/').at(-1);
      const select = url.searchParams.get('select');
      if (table === 'ops_pipeline_runs') {
        expect(url.searchParams.get('order')).toBe('started_at.desc,id.desc');
        return Response.json(
          select === 'episode_id'
            ? [{ episode_id: 'episode-1' }]
            : [
                {
                  id: 'run-1',
                  episode_id: 'episode-1',
                  pipeline: 'video_render',
                  status: 'completed',
                  started_at: '2026-09-01T00:00:00Z',
                },
              ],
        );
      }
      if (table === 'ops_pipeline_stage_runs') {
        expect(url.searchParams.get('order')).toBe('id.asc');
        const offset = Number(url.searchParams.get('offset') ?? 0);
        offsets.push(offset);
        return Response.json(
          Array.from({ length: offset === 0 ? 500 : 1 }, () => ({
            run_id: 'run-1',
            episode_id: 'episode-1',
            language_code: 'en',
            stage: 'video_render',
            status: 'completed',
            estimated_cost_usd: '0.00000001',
            pricing_basis: 'rate_card',
          })),
        );
      }
      if (table === 'episodes') {
        return Response.json([{ id: 'episode-1', source_title: 'Episode' }]);
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  );
  const service = createPodcastCostService({
    config: readControlCenterConfig({
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    }),
  });
  const result = await service.getPodcastCosts();
  expect(result.status).toBe('ok');
  expect(offsets).toEqual([0, 500]);
  expect(result.episodes[0]?.totalCostUsd).toBe(0.00000501);
  expect(result).toMatchObject({
    scope: { stageCount: 501, history: 'complete-for-selected-episodes' },
  });
});
