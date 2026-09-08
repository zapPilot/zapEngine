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

describe('loadWaitlistGrowth', () => {
  it('fails closed when the signup snapshot changes during collection', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(query({ count: 2, error: null }))
      .mockReturnValueOnce(query({ count: 1, error: null }))
      .mockReturnValueOnce(query({ count: 2, error: null }))
      .mockReturnValueOnce(
        query({
          data: [
            {
              id: 'signup-1',
              created_at: '2026-09-08T00:00:00.000Z',
              social_publish_job_id: 'job-1',
            },
            {
              id: 'signup-1',
              created_at: '2026-09-08T00:00:00.000Z',
              social_publish_job_id: 'job-1',
            },
          ],
          error: null,
        }),
      );
    const schema = vi.fn(() => {
      throw new Error('downstream attribution queries must not run');
    });
    const client = { from, schema } as unknown as SupabaseClient;
    const create = (() => client) as unknown as typeof createClient;

    const result = await loadWaitlistGrowth({
      create,
      url: 'https://example.supabase.co',
      key: 'test-key',
      now: new Date('2026-09-09T00:00:00.000Z'),
    });

    expect(result).toEqual({
      status: 'unavailable',
      message: 'Waitlist snapshot changed during collection',
      total: null,
      signups7d: null,
      signups30d: null,
      attributedSocial7d: null,
      directOrUnknown7d: null,
      conversions: [],
    });
    expect(schema).not.toHaveBeenCalled();
  });

  it('uses the latest collected 24h metric snapshot for conversion rate', async () => {
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
      .mockReturnValueOnce(
        query({
          data: [
            {
              id: 'metric-old',
              social_post_id: 'post-1',
              views: 100,
              captured_at: '2026-09-08T13:00:00.000Z',
            },
            {
              id: 'metric-new',
              social_post_id: 'post-1',
              views: 250,
              captured_at: '2026-09-08T14:00:00.000Z',
            },
          ],
          error: null,
        }),
      )
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
    expect(result.conversions).toEqual([
      {
        socialPublishJobId: 'job-1',
        episodeId: 'episode-1',
        platform: 'youtube',
        languageCode: 'en',
        socialPostId: 'post-1',
        signups: 1,
        views24h: 250,
        signupRate: 1 / 250,
      },
    ]);
  });
});
