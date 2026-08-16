import { beforeEach, describe, expect, it, vi } from 'vitest';

interface QueryResult {
  data: unknown;
  error: unknown;
}

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  terminalResults: [] as QueryResult[],
  calls: [] as { method: string; args: unknown[] }[],
}));

vi.mock('../services/supabase-client.js', () => ({
  getPipelineSupabase: () => ({ from: mocks.from, rpc: mocks.rpc }),
  throwSupabaseError: (error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  },
}));

import {
  activateSocialStrategy,
  claimSocialPublishJob,
  completeSocialPublishJob,
  enqueueSocialPublishJob,
  ensureSocialDaemonStart,
  failSocialPublishJob,
  getActiveSocialStrategies,
  getSocialStrategyById,
  latestScheduledSocialJobs,
  listDueMetricPosts,
  listLearningSocialMetrics,
  listLearningSocialPosts,
  listMetricWindowsForPosts,
  listSocialPublishCandidates,
  publishRetryDelayMs,
} from './daemon-store.js';

function nextResult(): QueryResult {
  const result = mocks.terminalResults.shift();
  if (!result) throw new Error('No queued Supabase result.');
  return result;
}

function queryBuilder() {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    in: vi.fn(),
    not: vi.fn(),
    maybeSingle: vi.fn(),
    single: vi.fn(),
    returns: vi.fn(),
    then: vi.fn(),
  };
  for (const method of [
    'select',
    'eq',
    'gte',
    'order',
    'limit',
    'upsert',
    'update',
    'insert',
    'in',
    'not',
  ] as const) {
    builder[method].mockImplementation((...args: unknown[]) => {
      mocks.calls.push({ method, args });
      return builder;
    });
  }
  for (const method of ['maybeSingle', 'single', 'returns'] as const) {
    builder[method].mockImplementation(() => Promise.resolve(nextResult()));
  }
  builder.then.mockImplementation(
    (
      resolve: (value: QueryResult) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(nextResult()).then(resolve, reject),
  );
  return builder;
}

function queue(...results: QueryResult[]): void {
  mocks.terminalResults.push(...results);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.terminalResults.length = 0;
  mocks.calls.length = 0;
  mocks.from.mockImplementation(() => queryBuilder());
  mocks.rpc.mockImplementation(() => Promise.resolve(nextResult()));
});

describe('social daemon store', () => {
  it('persists the first daemon start exactly once and handles an insert race', async () => {
    const now = new Date('2026-08-16T10:00:00.000Z');
    queue({
      data: { first_started_at: '2026-08-16T09:00:00.000Z' },
      error: null,
    });
    await expect(ensureSocialDaemonStart(now)).resolves.toBe(
      '2026-08-16T09:00:00.000Z',
    );

    queue(
      { data: null, error: null },
      { data: null, error: null },
      { data: { first_started_at: '2026-08-16T09:30:00.000Z' }, error: null },
    );
    await expect(ensureSocialDaemonStart(now)).resolves.toBe(
      '2026-08-16T09:30:00.000Z',
    );
    expect(mocks.calls.some((call) => call.method === 'upsert')).toBe(true);
  });

  it('maps candidate, enqueue, schedule, claim, and metric-list queries', async () => {
    queue({
      data: [{ episode_id: 'episode-1', ready_at: '2026-08-16T10:00:00Z' }],
      error: null,
    });
    await expect(
      listSocialPublishCandidates('2026-08-16T09:00:00Z'),
    ).resolves.toHaveLength(1);

    queue({ data: { id: 'job-1' }, error: null });
    await expect(
      enqueueSocialPublishJob({
        episodeId: 'episode-1',
        platform: 'x',
        scheduledAt: '2026-08-16T10:05:00Z',
        strategyVersionId: 'strategy-1',
      }),
    ).resolves.toBe(true);
    queue({ data: null, error: null });
    await expect(
      enqueueSocialPublishJob({
        episodeId: 'episode-1',
        platform: 'threads',
        scheduledAt: '2026-08-16T10:15:00Z',
      }),
    ).resolves.toBe(false);

    queue({
      data: [
        { platform: 'x', scheduled_at: '2026-08-16T10:05:00Z' },
        { platform: 'x', scheduled_at: '2026-08-16T09:05:00Z' },
        { platform: 'threads', scheduled_at: '2026-08-16T10:15:00Z' },
      ],
      error: null,
    });
    await expect(latestScheduledSocialJobs()).resolves.toEqual({
      x: '2026-08-16T10:05:00Z',
      threads: '2026-08-16T10:15:00Z',
    });

    const job = { id: 'job-1', platform: 'x' };
    queue({ data: [job], error: null });
    await expect(
      claimSocialPublishJob({
        owner: 'mac:1',
        now: new Date('2026-08-16T10:00:00Z'),
      }),
    ).resolves.toEqual(job);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_social_publish_job', {
      p_owner: 'mac:1',
      p_now: '2026-08-16T10:00:00.000Z',
    });

    queue({ data: [{ id: 'post-1' }], error: null });
    await expect(
      listLearningSocialPosts('2026-08-01T00:00:00Z'),
    ).resolves.toHaveLength(1);
    queue({ data: [{ id: 'metric-1' }], error: null });
    await expect(
      listLearningSocialMetrics('2026-08-01T00:00:00Z'),
    ).resolves.toHaveLength(1);
    queue({ data: [{ id: 'post-2' }], error: null });
    await expect(
      listDueMetricPosts('2026-08-01T00:00:00Z'),
    ).resolves.toHaveLength(1);
    await expect(listMetricWindowsForPosts([])).resolves.toEqual([]);
    queue({
      data: [{ social_post_id: 'post-1', measurement_window: '24h' }],
      error: null,
    });
    await expect(listMetricWindowsForPosts(['post-1'])).resolves.toHaveLength(
      1,
    );
  });

  it('fences completion and failure by lease owner and applies bounded retry backoff', async () => {
    const now = new Date('2026-08-16T10:00:00.000Z');
    queue({ data: { id: 'job-1' }, error: null });
    await expect(
      completeSocialPublishJob({
        jobId: 'job-1',
        owner: 'mac:1',
        completedAt: now,
        socialPostId: 'post-1',
      }),
    ).resolves.toBeUndefined();

    queue({ data: null, error: null });
    await expect(
      completeSocialPublishJob({
        jobId: 'job-lost',
        owner: 'mac:1',
        completedAt: now,
      }),
    ).rejects.toThrow('lease was lost');

    queue({ data: { id: 'job-2' }, error: null });
    await expect(
      failSocialPublishJob({
        jobId: 'job-2',
        owner: 'mac:1',
        now,
        attemptCount: 2,
        error: 'temporary failure',
      }),
    ).resolves.toBeUndefined();
    expect(publishRetryDelayMs(1)).toBe(5 * 60_000);
    expect(publishRetryDelayMs(2)).toBe(10 * 60_000);
    expect(publishRetryDelayMs(99)).toBe(6 * 60 * 60_000);
  });

  it('reads and activates versioned strategies while surfacing Supabase errors', async () => {
    const strategy = {
      id: 'strategy-1',
      platform: 'x',
      version: 1,
      config: { publishHoursJst: [19] },
      based_on_samples: 5,
      active: true,
      activated_at: '2026-08-16T10:00:00Z',
      created_at: '2026-08-16T10:00:00Z',
    };
    queue({ data: [strategy], error: null });
    await expect(getActiveSocialStrategies()).resolves.toEqual([strategy]);
    queue({ data: strategy, error: null });
    await expect(getSocialStrategyById('strategy-1')).resolves.toEqual(
      strategy,
    );

    const next = { ...strategy, id: 'strategy-2', version: 2 };
    queue(
      { data: [{ version: 1 }], error: null },
      { data: null, error: null },
      { data: next, error: null },
    );
    await expect(
      activateSocialStrategy({
        platform: 'x',
        config: { publishHoursJst: [12, 19] },
        basedOnSamples: 8,
        now: new Date('2026-08-16T10:00:00Z'),
      }),
    ).resolves.toEqual(next);

    queue({ data: null, error: new Error('query failed') });
    await expect(
      listSocialPublishCandidates('2026-08-01T00:00:00Z'),
    ).rejects.toThrow('query failed');
    queue({ data: null, error: new Error('rpc failed') });
    await expect(
      claimSocialPublishJob({ owner: 'mac:1', now: new Date() }),
    ).rejects.toThrow('rpc failed');
  });
});
