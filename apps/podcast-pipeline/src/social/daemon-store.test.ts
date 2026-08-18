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
  claimSocialPublishBatch,
  completeSocialPublishJob,
  enqueueSocialPublishJob,
  ensureSocialDaemonStart,
  failSocialPublishJob,
  getActiveSocialStrategies,
  getSocialQueueSnapshot,
  getSocialStrategyById,
  latestScheduledSocialJobs,
  listDueMetricPosts,
  listLearningSocialMetrics,
  listLearningSocialPosts,
  listMetricWindowsForPosts,
  listSocialPublishCandidates,
  listUnfinishedSocialPublishJobs,
  publishRetryDelayMs,
  reconcileSocialPublishJob,
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

  it('lists only unleased unfinished jobs and reconciles one without a lease', async () => {
    const now = new Date('2026-08-16T10:00:00.000Z');
    queue({
      data: [
        {
          id: 'job-1',
          episode_id: 'episode-1',
          platform: 'youtube',
          status: 'failed',
        },
      ],
      error: null,
    });
    await expect(listUnfinishedSocialPublishJobs()).resolves.toEqual([
      {
        id: 'job-1',
        episode_id: 'episode-1',
        platform: 'youtube',
        status: 'failed',
      },
    ]);
    expect(
      mocks.calls.some(
        (call) =>
          call.method === 'in' &&
          call.args[0] === 'status' &&
          Array.isArray(call.args[1]) &&
          !(call.args[1] as string[]).includes('processing'),
      ),
    ).toBe(true);

    queue({ data: null, error: null });
    await expect(listUnfinishedSocialPublishJobs()).resolves.toEqual([]);

    queue({ data: { id: 'job-1' }, error: null });
    await expect(
      reconcileSocialPublishJob({
        jobId: 'job-1',
        socialPostId: 'post-1',
        completedAt: now,
      }),
    ).resolves.toBe(true);
    const updates = mocks.calls.filter((call) => call.method === 'update');
    expect(updates[updates.length - 1]?.args[0]).toMatchObject({
      status: 'completed',
      social_post_id: 'post-1',
      lease_owner: null,
      last_error: null,
    });

    queue({ data: null, error: null });
    await expect(
      reconcileSocialPublishJob({
        jobId: 'job-claimed',
        socialPostId: 'post-1',
        completedAt: now,
      }),
    ).resolves.toBe(false);

    queue({ data: null, error: new Error('reconcile boom') });
    await expect(
      reconcileSocialPublishJob({
        jobId: 'job-1',
        socialPostId: 'post-1',
        completedAt: now,
      }),
    ).rejects.toThrow('reconcile boom');

    queue({ data: null, error: new Error('list boom') });
    await expect(listUnfinishedSocialPublishJobs()).rejects.toThrow(
      'list boom',
    );
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

    queue(
      {
        data: [
          {
            episode_id: 'episode-1',
            platform: 'x',
            status: 'queued',
            scheduled_at: '2026-08-16T10:05:00Z',
            next_attempt_at: '2026-08-16T10:05:00Z',
          },
          {
            episode_id: 'episode-2',
            platform: 'x',
            status: 'failed',
            scheduled_at: '2026-08-16T09:05:00Z',
            next_attempt_at: '2026-08-16T10:35:00Z',
          },
          {
            episode_id: 'episode-2',
            platform: 'threads',
            status: 'queued',
            scheduled_at: '2026-08-16T10:15:00Z',
            next_attempt_at: '2026-08-16T10:15:00Z',
          },
        ],
        error: null,
      },
      {
        data: [
          { episode_id: 'episode-1', title: 'First episode' },
          { episode_id: 'episode-2', title: 'Second episode' },
        ],
        error: null,
      },
    );
    await expect(getSocialQueueSnapshot()).resolves.toEqual({
      pendingCount: 3,
      episodeQueue: [
        {
          episodeId: 'episode-1',
          title: 'First episode',
          nextAt: '2026-08-16T10:05:00Z',
        },
        {
          episodeId: 'episode-2',
          title: 'Second episode',
          nextAt: '2026-08-16T10:15:00Z',
        },
      ],
      nextByPlatform: {
        x: {
          episodeId: 'episode-1',
          platform: 'x',
          status: 'queued',
          title: 'First episode',
          nextAt: '2026-08-16T10:05:00Z',
        },
        threads: {
          episodeId: 'episode-2',
          platform: 'threads',
          status: 'queued',
          title: 'Second episode',
          nextAt: '2026-08-16T10:15:00Z',
        },
      },
    });

    const job = { id: 'job-1', platform: 'x' };
    queue({ data: [job], error: null });
    await expect(
      claimSocialPublishBatch({
        owner: 'mac:1',
        now: new Date('2026-08-16T10:00:00Z'),
      }),
    ).resolves.toEqual([job]);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_social_publish_batch', {
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

  it('covers null rows and every Supabase failure boundary without fabricating state', async () => {
    const now = new Date('2026-08-16T10:00:00.000Z');

    queue({ data: null, error: new Error('daemon read failed') });
    await expect(ensureSocialDaemonStart(now)).rejects.toThrow(
      'daemon read failed',
    );

    queue(
      { data: null, error: null },
      { data: null, error: new Error('daemon upsert failed') },
    );
    await expect(ensureSocialDaemonStart(now)).rejects.toThrow(
      'daemon upsert failed',
    );

    queue(
      { data: null, error: null },
      { data: { first_started_at: '2026-08-16T10:00:00.000Z' }, error: null },
    );
    await expect(ensureSocialDaemonStart(now)).resolves.toBe(
      '2026-08-16T10:00:00.000Z',
    );

    queue(
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: new Error('daemon race read failed') },
    );
    await expect(ensureSocialDaemonStart(now)).rejects.toThrow(
      'daemon race read failed',
    );

    queue({ data: null, error: null });
    await expect(
      listSocialPublishCandidates('2026-08-01T00:00:00Z'),
    ).resolves.toEqual([]);
    queue({ data: null, error: new Error('enqueue failed') });
    await expect(
      enqueueSocialPublishJob({
        episodeId: 'episode-1',
        platform: 'x',
        scheduledAt: now.toISOString(),
      }),
    ).rejects.toThrow('enqueue failed');

    queue({ data: null, error: new Error('schedule lookup failed') });
    await expect(latestScheduledSocialJobs()).rejects.toThrow(
      'schedule lookup failed',
    );
    queue({ data: null, error: null });
    await expect(latestScheduledSocialJobs()).resolves.toEqual({});

    queue({ data: null, error: null });
    await expect(
      claimSocialPublishBatch({ owner: 'mac:1', now }),
    ).resolves.toEqual([]);

    queue({ data: null, error: new Error('lease update failed') });
    await expect(
      completeSocialPublishJob({
        jobId: 'job-1',
        owner: 'mac:1',
        completedAt: now,
      }),
    ).rejects.toThrow('lease update failed');

    queue({ data: null, error: new Error('active lookup failed') });
    await expect(getActiveSocialStrategies()).rejects.toThrow(
      'active lookup failed',
    );
    queue({ data: null, error: null });
    await expect(getActiveSocialStrategies()).resolves.toEqual([]);

    queue({ data: null, error: new Error('strategy lookup failed') });
    await expect(getSocialStrategyById('strategy-1')).rejects.toThrow(
      'strategy lookup failed',
    );

    queue({ data: null, error: new Error('learning posts failed') });
    await expect(
      listLearningSocialPosts('2026-08-01T00:00:00Z'),
    ).rejects.toThrow('learning posts failed');
    queue({ data: null, error: null });
    await expect(
      listLearningSocialPosts('2026-08-01T00:00:00Z'),
    ).resolves.toEqual([]);

    queue({ data: null, error: new Error('learning metrics failed') });
    await expect(
      listLearningSocialMetrics('2026-08-01T00:00:00Z'),
    ).rejects.toThrow('learning metrics failed');
    queue({ data: null, error: null });
    await expect(
      listLearningSocialMetrics('2026-08-01T00:00:00Z'),
    ).resolves.toEqual([]);

    queue({ data: null, error: new Error('metric windows failed') });
    await expect(listMetricWindowsForPosts(['post-1'])).rejects.toThrow(
      'metric windows failed',
    );
    queue({ data: null, error: null });
    await expect(listMetricWindowsForPosts(['post-1'])).resolves.toEqual([]);
  });

  it('surfaces each activation-stage error and starts versioning at one', async () => {
    const input = {
      platform: 'x' as const,
      config: {
        publishSlotsJst: [
          { hour: 12, minute: 0 },
          { hour: 19, minute: 0 },
        ],
      },
      basedOnSamples: 8,
      now: new Date('2026-08-16T10:00:00Z'),
    };

    queue({ data: null, error: new Error('version lookup failed') });
    await expect(activateSocialStrategy(input)).rejects.toThrow(
      'version lookup failed',
    );

    queue(
      { data: null, error: null },
      { data: null, error: new Error('deactivate failed') },
    );
    await expect(activateSocialStrategy(input)).rejects.toThrow(
      'deactivate failed',
    );

    queue(
      { data: [], error: null },
      { data: null, error: null },
      { data: null, error: new Error('insert strategy failed') },
    );
    await expect(activateSocialStrategy(input)).rejects.toThrow(
      'insert strategy failed',
    );
    const insertCall = mocks.calls.find((call) => call.method === 'insert');
    expect(insertCall?.args[0]).toEqual(
      expect.objectContaining({ version: 1 }),
    );
  });

  it('reads and activates versioned strategies while surfacing Supabase errors', async () => {
    const strategy = {
      id: 'strategy-1',
      platform: 'x',
      version: 1,
      config: { publishSlotsJst: [{ hour: 19, minute: 0 }] },
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
        config: {
          publishSlotsJst: [
            { hour: 12, minute: 0 },
            { hour: 19, minute: 0 },
          ],
        },
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
      claimSocialPublishBatch({ owner: 'mac:1', now: new Date() }),
    ).rejects.toThrow('rpc failed');
  });
});
