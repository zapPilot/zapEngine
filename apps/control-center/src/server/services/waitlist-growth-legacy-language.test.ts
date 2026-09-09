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

describe('loadWaitlistGrowth legacy attribution', () => {
  it('keeps legacy jobs with missing language and social post attributable', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(query({ count: 1, error: null }))
      .mockReturnValueOnce(query({ count: 1, error: null }))
      .mockReturnValueOnce(query({ count: 1, error: null }))
      .mockReturnValueOnce(
        query({
          data: [
            {
              id: 'signup-legacy',
              created_at: '2026-09-08T12:00:00.000Z',
              social_publish_job_id: 'job-legacy',
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
              id: 'job-legacy',
              episode_id: 'episode-legacy',
              platform: 'youtube',
              language_code: null,
              social_post_id: null,
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

    expect(result).toEqual({
      status: 'ok',
      message: null,
      total: 1,
      signups7d: 1,
      signups30d: 1,
      attributedSocial7d: 1,
      directOrUnknown7d: 0,
      conversions: [
        {
          socialPublishJobId: 'job-legacy',
          episodeId: 'episode-legacy',
          platform: 'youtube',
          languageCode: 'unknown',
          socialPostId: null,
          signups: 1,
          views24h: null,
          signupRate: null,
        },
      ],
    });
    expect(pipelineFrom).toHaveBeenCalledTimes(2);
  });
});
