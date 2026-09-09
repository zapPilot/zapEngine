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

describe('loadWaitlistGrowth metric pagination', () => {
  it('keeps the newest 24h snapshot when metrics cross the 500-row page boundary', async () => {
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

    const jobPage = query({
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
    });
    const jobPageDone = query({ data: [], error: null });
    const firstMetricPage = query({
      data: Array.from({ length: 500 }, (_, index) => ({
        id: `metric-${String(index + 1).padStart(3, '0')}`,
        social_post_id: 'post-1',
        views: index + 1,
        captured_at: '2026-09-08T13:00:00.000Z',
      })),
      error: null,
    });
    const secondMetricPage = query({
      data: [
        {
          id: 'metric-501',
          social_post_id: 'post-1',
          views: 999,
          captured_at: '2026-09-08T14:00:00.000Z',
        },
      ],
      error: null,
    });
    const metricsDone = query({ data: [], error: null });
    const pipelineFrom = vi
      .fn()
      .mockReturnValueOnce(jobPage)
      .mockReturnValueOnce(jobPageDone)
      .mockReturnValueOnce(firstMetricPage)
      .mockReturnValueOnce(secondMetricPage)
      .mockReturnValueOnce(metricsDone);
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
        views24h: 999,
        signupRate: 1 / 999,
      },
    ]);
    expect(firstMetricPage.range).toHaveBeenCalledWith(0, 499);
    expect(secondMetricPage.range).toHaveBeenCalledWith(500, 999);
    expect(metricsDone.range).toHaveBeenCalledWith(501, 1000);
  });

  it('uses id as a deterministic tie-break when snapshots share captured_at', async () => {
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

    const jobPage = query({
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
    });
    const jobPageDone = query({ data: [], error: null });
    const metricPage = query({
      data: [
        {
          id: 'metric-001',
          social_post_id: 'post-1',
          views: 100,
          captured_at: '2026-09-08T14:00:00.000Z',
        },
        {
          id: 'metric-002',
          social_post_id: 'post-1',
          views: 250,
          captured_at: '2026-09-08T14:00:00.000Z',
        },
      ],
      error: null,
    });
    const metricsDone = query({ data: [], error: null });
    const pipelineFrom = vi
      .fn()
      .mockReturnValueOnce(jobPage)
      .mockReturnValueOnce(jobPageDone)
      .mockReturnValueOnce(metricPage)
      .mockReturnValueOnce(metricsDone);
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
      expect.objectContaining({
        socialPostId: 'post-1',
        signups: 1,
        views24h: 250,
        signupRate: 1 / 250,
      }),
    ]);
  });

  it('degrades views when offset pagination repeats a metric row', async () => {
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

    const jobPage = query({
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
    });
    const jobPageDone = query({ data: [], error: null });
    const firstMetricPage = query({
      data: Array.from({ length: 500 }, (_, index) => ({
        id: `metric-${String(index + 1).padStart(3, '0')}`,
        social_post_id: 'post-1',
        views: index + 1,
        captured_at: '2026-09-08T13:00:00.000Z',
      })),
      error: null,
    });
    const repeatedMetricPage = query({
      data: [
        {
          id: 'metric-500',
          social_post_id: 'post-1',
          views: 999,
          captured_at: '2026-09-08T13:00:00.000Z',
        },
      ],
      error: null,
    });
    const pipelineFrom = vi
      .fn()
      .mockReturnValueOnce(jobPage)
      .mockReturnValueOnce(jobPageDone)
      .mockReturnValueOnce(firstMetricPage)
      .mockReturnValueOnce(repeatedMetricPage);
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
    expect(result.message).toBe(
      '24h views unavailable; persisted signup counts remain available.',
    );
    expect(result.conversions).toEqual([
      expect.objectContaining({
        socialPostId: 'post-1',
        signups: 1,
        views24h: null,
        signupRate: null,
      }),
    ]);
    expect(firstMetricPage.range).toHaveBeenCalledWith(0, 499);
    expect(repeatedMetricPage.range).toHaveBeenCalledWith(500, 999);
  });
});
