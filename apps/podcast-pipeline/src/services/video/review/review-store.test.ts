import { beforeEach, describe, expect, it, vi } from 'vitest';

interface QueryResult {
  data: unknown;
  error: unknown;
}

const supabase = vi.hoisted(() => {
  const results = new Map<string, QueryResult[]>();
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const rpc = vi.fn();
  const from = vi.fn((table: string) => {
    const result = results.get(table)?.shift() ?? { data: null, error: null };
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'order', 'limit', 'eq', 'in']) {
      builder[method] = vi.fn((...args: unknown[]) => {
        calls.push({ table, method, args });
        return builder;
      });
    }
    builder['then'] = (
      resolve: (value: QueryResult) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  return { results, calls, rpc, from };
});

vi.mock('../../supabase-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../supabase-client.js')>()),
  getPipelineSupabase: () => ({ from: supabase.from, rpc: supabase.rpc }),
}));

import { listReviewsForExport, resolveReview } from './review-store.js';

function reviewRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'review-1',
    episode_id: 'episode-1',
    visual_hash: 'hash-1',
    language_code: 'ja',
    scene_id: 'scene-01',
    reviewer: 'agent',
    verdict: 'reject',
    issue_categories: ['blurry', 42, 'wrong-subject'],
    note: 'note',
    pipeline_context: { stage: 'plan-assets' },
    status: 'open',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

function methodCalls(table: string, method: string): unknown[][] {
  return supabase.calls
    .filter((call) => call.table === table && call.method === method)
    .map((call) => call.args);
}

beforeEach(() => {
  supabase.results.clear();
  supabase.calls.length = 0;
  supabase.rpc.mockReset();
  supabase.from.mockClear();
});

describe('listReviewsForExport', () => {
  it('maps rows, looks up episode titles and applies status/episode filters', async () => {
    supabase.results.set('episode_video_reviews', [
      {
        data: [
          reviewRow(),
          reviewRow({
            id: 'review-2',
            episode_id: 'episode-2',
            reviewer: 'operator',
            visual_hash: null,
            language_code: undefined,
            scene_id: null,
            note: '   ',
            issue_categories: 'not-an-array',
            pipeline_context: ['array'],
            created_at: null,
            updated_at: 7,
          }),
        ],
        error: null,
      },
    ]);
    supabase.results.set('episodes', [
      {
        data: [{ id: 'episode-1', source_title: 'Title one' }],
        error: null,
      },
    ]);

    const rows = await listReviewsForExport({
      status: 'open',
      episodeId: 'episode-1',
      limit: 25,
    });

    expect(rows).toEqual([
      {
        id: 'review-1',
        episodeId: 'episode-1',
        title: 'Title one',
        visualHash: 'hash-1',
        languageCode: 'ja',
        sceneId: 'scene-01',
        reviewer: 'agent',
        verdict: 'reject',
        issueCategories: ['blurry', 'wrong-subject'],
        note: 'note',
        pipelineContext: { stage: 'plan-assets' },
        status: 'open',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-02T00:00:00.000Z',
      },
      {
        id: 'review-2',
        episodeId: 'episode-2',
        title: null,
        visualHash: null,
        languageCode: null,
        sceneId: null,
        reviewer: 'operator',
        verdict: 'reject',
        issueCategories: [],
        note: null,
        pipelineContext: {},
        status: 'open',
        createdAt: '',
        updatedAt: '',
      },
    ]);
    expect(methodCalls('episode_video_reviews', 'limit')).toEqual([[25]]);
    expect(methodCalls('episode_video_reviews', 'eq')).toEqual([
      ['status', 'open'],
      ['episode_id', 'episode-1'],
    ]);
    expect(methodCalls('episodes', 'in')).toEqual([
      ['id', ['episode-1', 'episode-2']],
    ]);
  });

  it('skips the status filter for all, drops malformed rows and skips title lookup when empty', async () => {
    supabase.results.set('episode_video_reviews', [
      {
        data: [
          reviewRow({ id: '' }),
          reviewRow({ episode_id: 12 }),
          reviewRow({ verdict: null }),
          reviewRow({ status: '  ' }),
        ],
        error: null,
      },
    ]);

    const rows = await listReviewsForExport({ status: 'all', limit: 10 });

    expect(rows).toEqual([]);
    expect(methodCalls('episode_video_reviews', 'eq')).toEqual([]);
    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(methodCalls('episodes', 'in')).toEqual([['id', ['episode-1']]]);
  });

  it('does not query episodes when no row carries an episode id', async () => {
    supabase.results.set('episode_video_reviews', [
      { data: null, error: null },
    ]);

    await expect(
      listReviewsForExport({ status: 'triaged', limit: 5 }),
    ).resolves.toEqual([]);
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('throws when the review query or title lookup fails', async () => {
    supabase.results.set('episode_video_reviews', [
      { data: null, error: { message: 'reviews failed' } },
    ]);
    await expect(
      listReviewsForExport({ status: 'open', limit: 5 }),
    ).rejects.toThrow('reviews failed');

    supabase.results.set('episode_video_reviews', [
      { data: [reviewRow()], error: null },
    ]);
    supabase.results.set('episodes', [
      { data: null, error: { message: 'titles failed' } },
    ]);
    await expect(
      listReviewsForExport({ status: 'open', limit: 5 }),
    ).rejects.toThrow('titles failed');
  });
});

describe('resolveReview', () => {
  it('calls the resolve RPC and reports whether a row changed', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(
      resolveReview({ id: 'review-1', status: 'triaged', note: 'checked' }),
    ).resolves.toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('resolve_episode_video_review', {
      p_review_id: 'review-1',
      p_status: 'triaged',
      p_resolution_note: 'checked',
      p_resolved_by: 'agent',
    });

    supabase.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(
      resolveReview({ id: 'review-1', status: 'resolved' }),
    ).resolves.toBe(false);
    expect(supabase.rpc).toHaveBeenLastCalledWith(
      'resolve_episode_video_review',
      expect.objectContaining({ p_resolution_note: null }),
    );
  });

  it('throws when the RPC fails', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'rpc failed' },
    });
    await expect(
      resolveReview({ id: 'review-1', status: 'resolved', note: null }),
    ).rejects.toThrow('rpc failed');
  });
});
