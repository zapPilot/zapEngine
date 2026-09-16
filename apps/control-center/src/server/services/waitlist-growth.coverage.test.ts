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

function clientWithCounts(
  counts: QueryResult[],
  signupPage: ReturnType<typeof query>,
) {
  const from = vi
    .fn()
    .mockReturnValueOnce(query(counts[0]!))
    .mockReturnValueOnce(query(counts[1]!))
    .mockReturnValueOnce(query(counts[2]!))
    .mockReturnValue(signupPage);
  const client = {
    from,
    schema: vi.fn(() => ({ from: vi.fn() })),
  } as unknown as SupabaseClient;
  return { create: (() => client) as unknown as typeof createClient, from };
}

const NOW = new Date('2026-09-09T00:00:00.000Z');

describe('waitlist growth count branches', () => {
  it('fails closed when the count comes back null', async () => {
    const { create } = clientWithCounts(
      [
        { count: null, error: null },
        { count: 1, error: null },
        { count: 1, error: null },
      ],
      query({ data: [], error: null }),
    );

    const result = await loadWaitlistGrowth({
      create,
      url: 'https://example.supabase.co',
      key: 'k',
      now: NOW,
    });

    expect(result.status).toBe('unavailable');
    expect(result.message).toBe('Waitlist count unavailable');
  });

  it('fails closed when the signup page errors', async () => {
    const pageError = new Error('signup page down');
    const { create } = clientWithCounts(
      [
        { count: 1, error: null },
        { count: 1, error: null },
        { count: 1, error: null },
      ],
      query({ data: null, error: pageError }),
    );

    const result = await loadWaitlistGrowth({
      create,
      url: 'https://example.supabase.co',
      key: 'k',
      now: NOW,
    });

    expect(result.status).toBe('unavailable');
    expect(result.message).toBe('signup page down');
  });

  it('fails closed when the signup page returns no rows', async () => {
    const { create } = clientWithCounts(
      [
        { count: 1, error: null },
        { count: 1, error: null },
        { count: 1, error: null },
      ],
      query({ data: [], error: null }),
    );

    const result = await loadWaitlistGrowth({
      create,
      url: 'https://example.supabase.co',
      key: 'k',
      now: NOW,
    });

    expect(result.status).toBe('unavailable');
    expect(result.message).toBe('Waitlist snapshot incomplete');
  });
});
