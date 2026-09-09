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
    in: vi.fn(function (this: unknown) {
      return this;
    }),
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

describe('loadWaitlistGrowth batching', () => {
  it('preserves attribution when canonical job ids cross the 100-id batch boundary', async () => {
    const signups = Array.from({ length: 101 }, (_, index) => ({
      id: `signup-${index + 1}`,
      created_at: '2026-09-08T12:00:00.000Z',
      social_publish_job_id: `job-${String(index + 1).padStart(3, '0')}`,
    }));
    const jobs = signups.map((signup, index) => ({
      id: signup.social_publish_job_id,
      episode_id: `episode-${index + 1}`,
      platform: 'threads',
      language_code: 'ja',
      social_post_id: null,
    }));

    const from = vi
      .fn()
      .mockReturnValueOnce(query({ count: 101, error: null }))
      .mockReturnValueOnce(query({ count: 101, error: null }))
      .mockReturnValueOnce(query({ count: 101, error: null }))
      .mockReturnValueOnce(query({ data: signups, error: null }));

    const firstBatch = query({ data: jobs.slice(0, 100), error: null });
    const firstBatchDone = query({ data: [], error: null });
    const secondBatch = query({ data: jobs.slice(100), error: null });
    const secondBatchDone = query({ data: [], error: null });
    const pipelineFrom = vi
      .fn()
      .mockReturnValueOnce(firstBatch)
      .mockReturnValueOnce(firstBatchDone)
      .mockReturnValueOnce(secondBatch)
      .mockReturnValueOnce(secondBatchDone);
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
    expect(result.attributedSocial7d).toBe(101);
    expect(result.directOrUnknown7d).toBe(0);
    expect(result.conversions).toHaveLength(101);
    expect(
      result.conversions.map((conversion) => conversion.socialPublishJobId),
    ).toEqual(jobs.map((job) => job.id));
    expect(firstBatch.in).toHaveBeenCalledWith(
      'id',
      jobs.slice(0, 100).map((job) => job.id),
    );
    expect(secondBatch.in).toHaveBeenCalledWith('id', [jobs[100]!.id]);
  });
});
