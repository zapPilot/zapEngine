import type { createClient, SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { loadWaitlistGrowth } from './waitlist-growth.js';

type QueryResult = {
  count?: number | null;
  data?: unknown[] | null;
  error: Error | null;
};

function query(result: QueryResult) {
  const promise = () => Promise.resolve(result);
  return {
    select() {
      return this;
    },
    lte() {
      return this;
    },
    gte() {
      return this;
    },
    in() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    range() {
      return promise();
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?:
        | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ) {
      return promise().then(onfulfilled, onrejected);
    },
  };
}

function trackedQuery(result: QueryResult) {
  const promise = () => Promise.resolve(result);
  return {
    select: vi.fn(function (this: unknown) {
      return this;
    }),
    lte: vi.fn(function (this: unknown) {
      return this;
    }),
    gte: vi.fn(function (this: unknown) {
      return this;
    }),
    in: vi.fn(function (this: unknown) {
      return this;
    }),
    eq: vi.fn(function (this: unknown) {
      return this;
    }),
    order: vi.fn(function (this: unknown) {
      return this;
    }),
    range: vi.fn(() => promise()),
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?:
        | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
        | null,
    ) {
      return promise().then(onfulfilled, onrejected);
    },
  };
}

describe('loadWaitlistGrowth metric query contract', () => {
  it('pins collected 24h metrics to the snapshot upper bound and stable ordering', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(query({ count: 1, error: null }))
      .mockReturnValueOnce(query({ count: 1, error: null }))
      .mockReturnValueOnce(query({ count: 1, error: null }))
      .mockReturnValueOnce(
        query({
          data: [
            {
              id: 'signup-1',
              created_at: '2026-09-08T12:00:00.000Z',
              social_publish_job_id: 'job-1',
            },
          ],
          error: null,
        }),
      );

    const metricPage = trackedQuery({
      data: [
        {
          id: 'metric-1',
          social_post_id: 'post-1',
          views: 250,
          captured_at: '2026-09-08T14:00:00.000Z',
        },
      ],
      error: null,
    });
    const pipelineFrom = vi
      .fn()
      .mockReturnValueOnce(
        query({
          data: [
            {
              id: 'job-1',
              episode_id: 'episode-1',
              platform: 'youtube',
              language_code: 'en',
              social_post_id: 'post-1',
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(query({ data: [], error: null }))
      .mockReturnValueOnce(metricPage)
      .mockReturnValueOnce(query({ data: [], error: null }));
    const schema = vi.fn(() => ({ from: pipelineFrom }));
    const client = { from, schema } as unknown as SupabaseClient;
    const create = (() => client) as unknown as typeof createClient;

    const result = await loadWaitlistGrowth({
      create,
      url: 'https://example.supabase.co',
      key: 'test-key',
      now: new Date('2026-09-09T00:00:00.000Z'),
    });

    expect(result.status).toBe('ok');
    expect(metricPage.in).toHaveBeenCalledWith('social_post_id', ['post-1']);
    expect(metricPage.eq).toHaveBeenNthCalledWith(
      1,
      'measurement_window',
      '24h',
    );
    expect(metricPage.eq).toHaveBeenNthCalledWith(
      2,
      'collection_status',
      'collected',
    );
    expect(metricPage.lte).toHaveBeenCalledWith(
      'captured_at',
      '2026-09-09T00:00:00.000Z',
    );
    expect(metricPage.order).toHaveBeenNthCalledWith(1, 'captured_at', {
      ascending: true,
    });
    expect(metricPage.order).toHaveBeenNthCalledWith(2, 'id', {
      ascending: true,
    });
    expect(metricPage.range).toHaveBeenCalledWith(0, 499);
  });
});
