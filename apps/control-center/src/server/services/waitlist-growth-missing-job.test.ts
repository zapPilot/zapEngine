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

describe('loadWaitlistGrowth missing canonical job', () => {
  it('classifies a signup as unknown when its canonical publish job no longer exists', async () => {
    const signupPage = query({
      data: [
        {
          id: 'signup-1',
          created_at: '2026-09-08T12:00:00.000Z',
          social_publish_job_id: 'job-missing',
        },
      ],
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(query({ count: 1, error: null }))
      .mockReturnValueOnce(query({ count: 1, error: null }))
      .mockReturnValueOnce(query({ count: 1, error: null }))
      .mockReturnValueOnce(signupPage);
    const missingJobPage = query({ data: [], error: null });
    const pipelineFrom = vi.fn().mockReturnValueOnce(missingJobPage);
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
    expect(result.total).toBe(1);
    expect(result.signups7d).toBe(1);
    expect(result.attributedSocial7d).toBe(0);
    expect(result.directOrUnknown7d).toBe(1);
    expect(result.conversions).toEqual([]);
    expect(missingJobPage.in).toHaveBeenCalledWith('id', ['job-missing']);
  });
});
