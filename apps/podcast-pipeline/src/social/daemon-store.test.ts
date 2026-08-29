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
  listLearningSocialMetrics,
  listLearningSocialPosts,
  listMetricWindowsForPosts,
  listPastDueSocialPublishJobs,
  listSocialPublishCandidates,
  listSocialPublishCandidatesForEpisodes,
  listUnfinishedSocialPublishJobs,
  publishRetryDelayMs,
  reconcileSocialPublishJob,
  releaseSocialPublishJobLease,
  rescheduleSocialPublishJob,
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
    lt: vi.fn(),
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
    'lt',
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
  it('collapses channel-shaped waiting rows into language video requirements', async () => {
    queue(
      { data: [], error: null },
      {
        data: [
          { episode_id: 'episode-1', language_code: 'ja' },
          { episode_id: 'episode-1', language_code: 'ja' },
          { episode_id: 'episode-1', language_code: 'en' },
        ],
        error: null,
      },
      {
        data: [
          {
            episode_id: 'episode-1',
            language_code: 'zh-Hant',
            title: '從巴菲特到但斌：七大基金持倉揭示人工智慧投資輪動',
          },
          {
            episode_id: 'episode-1',
            language_code: 'ja',
            title: 'バフェットからダン・ビンまで',
          },
          {
            episode_id: 'episode-1',
            language_code: 'en',
            title: 'From Buffett to Dan Bin',
          },
        ],
        error: null,
      },
    );

    const snapshot = await getSocialQueueSnapshot({
      includeWaitingMedia: true,
    });

    expect(snapshot.waitingVideos).toEqual([
      {
        episodeId: 'episode-1',
        title: '從巴菲特到但斌：七大基金持倉揭示人工智慧投資輪動',
        languageCodes: ['ja', 'en'],
      },
    ]);
    expect(mocks.from).toHaveBeenCalledWith('social_waiting_media');
  });

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

    queue(
      {
        data: [
          {
            episode_id: 'episode-1',
            platform: 'x',
            status: 'queued',
            scheduled_at: '2026-08-16T10:05:00Z',
            next_attempt_at: '2026-08-16T10:05:00Z',
            attempt_count: 0,
          },
          {
            episode_id: 'episode-2',
            platform: 'x',
            status: 'failed',
            scheduled_at: '2026-08-16T09:05:00Z',
            next_attempt_at: '2026-08-16T10:35:00Z',
            attempt_count: 0,
          },
          {
            episode_id: 'episode-2',
            platform: 'threads',
            status: 'queued',
            scheduled_at: '2026-08-16T10:15:00Z',
            next_attempt_at: '2026-08-16T10:15:00Z',
            attempt_count: 0,
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
          languageCode: 'zh-Hant',
          platform: 'x',
          status: 'queued',
          title: 'First episode',
          nextAt: '2026-08-16T10:05:00Z',
          attemptCount: 0,
          attemptsExhausted: false,
        },
        threads: {
          episodeId: 'episode-2',
          languageCode: 'zh-Hant',
          platform: 'threads',
          status: 'queued',
          title: 'Second episode',
          nextAt: '2026-08-16T10:15:00Z',
          attemptCount: 0,
          attemptsExhausted: false,
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
      config: { preferredHookTypes: ['question'] },
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
      config: { preferredHookTypes: ['question'] },
      based_on_samples: 5,
      active: true,
      activated_at: '2026-08-16T10:00:00Z',
      created_at: '2026-08-16T10:00:00Z',
    };
    queue({ data: [strategy], error: null });
    await expect(getActiveSocialStrategies()).resolves.toEqual([strategy]);

    const next = { ...strategy, id: 'strategy-2', version: 2 };
    queue(
      { data: [{ version: 1 }], error: null },
      { data: null, error: null },
      { data: next, error: null },
    );
    await expect(
      activateSocialStrategy({
        platform: 'x',
        config: { preferredHashtags: ['macro'] },
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

  // The claim takes whatever is due, with no episode or platform narrowing:
  // the cross-episode fence it existed for would deadlock a queue whose
  // platforms deliberately publish the same episode hours apart.
  it('claims everything due without narrowing the RPC', async () => {
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
  });

  it('reads every ready localization for a set of episodes, unfiltered by the discovery anchor', async () => {
    await expect(listSocialPublishCandidatesForEpisodes([])).resolves.toEqual(
      [],
    );

    queue({
      data: [
        {
          episode_id: 'episode-1',
          ready_at: '2026-08-10T00:00:00Z',
          language_code: 'zh-Hant',
          episode_created_at: '2026-08-24T00:00:00Z',
        },
      ],
      error: null,
    });
    await expect(
      listSocialPublishCandidatesForEpisodes(['episode-1']),
    ).resolves.toHaveLength(1);

    queue({ data: null, error: new Error('candidates by episode failed') });
    await expect(
      listSocialPublishCandidatesForEpisodes(['episode-1']),
    ).rejects.toThrow('candidates by episode failed');
  });

  it('reads past-due lanes without touching a lease someone may hold', async () => {
    const job = {
      id: 'job-1',
      episode_id: 'episode-1',
      platform: 'rednote',
      language_code: 'zh-Hant',
      status: 'queued',
      scheduled_at: '2026-08-16T05:30:00Z',
    };
    queue({ data: [job], error: null });
    await expect(
      listPastDueSocialPublishJobs(new Date('2026-08-16T10:00:00Z')),
    ).resolves.toEqual([job]);
    // `processing` is absent on purpose: only the claim RPC may take an
    // expired lease back.
    expect(mocks.calls.filter((call) => call.method === 'in')).toContainEqual({
      method: 'in',
      args: ['status', ['queued', 'failed']],
    });

    queue({ data: null, error: new Error('past due failed') });
    await expect(
      listPastDueSocialPublishJobs(new Date('2026-08-16T10:00:00Z')),
    ).rejects.toThrow('past due failed');
  });

  it('moves a missed slot forward on both claim gates, fenced by status', async () => {
    queue({ data: { id: 'job-1' }, error: null });
    await expect(
      rescheduleSocialPublishJob({
        jobId: 'job-1',
        status: 'failed',
        scheduledAt: new Date('2026-08-17T05:30:00Z'),
        now: new Date('2026-08-16T10:00:00Z'),
      }),
    ).resolves.toBe(true);
    const updates = mocks.calls.filter((call) => call.method === 'update');
    // `next_attempt_at` follows the new slot because the claim RPC fences on
    // both: retry backoff left behind it would make the lane unclaimable at
    // the very time it is now due.
    expect(updates[updates.length - 1]?.args[0]).toEqual({
      scheduled_at: '2026-08-17T05:30:00.000Z',
      next_attempt_at: '2026-08-17T05:30:00.000Z',
      updated_at: '2026-08-16T10:00:00.000Z',
    });
    expect(mocks.calls.filter((call) => call.method === 'eq')).toContainEqual({
      method: 'eq',
      args: ['status', 'failed'],
    });
  });

  // A publish that dies mid-cohort leaves its own lane `processing` under a live
  // 60-minute lease. Asserted on the query filter rather than on returned rows:
  // the in-memory reduce already treats every non-completed status as pending,
  // so a status missing from the filter never reaches it and no fixture of rows
  // can expose the gap.
  it('reports a reschedule that raced a claim as not applied', async () => {
    // The status fence is what makes this safe beside a live claim: a row the
    // RPC already took is `processing` and matches nothing here.
    queue({ data: null, error: null });
    await expect(
      rescheduleSocialPublishJob({
        jobId: 'job-1',
        status: 'queued',
        scheduledAt: new Date('2026-08-17T05:30:00Z'),
        now: new Date('2026-08-16T10:00:00Z'),
      }),
    ).resolves.toBe(false);
  });

  it('releases an untouched lane back to queued without applying retry backoff', async () => {
    const now = new Date('2026-08-16T10:05:00Z');
    queue({ data: { id: 'job-1' }, error: null });
    await expect(
      releaseSocialPublishJobLease({
        jobId: 'job-1',
        owner: 'mac:1',
        scheduledAt: '2026-08-16T10:00:00Z',
        now,
      }),
    ).resolves.toBeUndefined();
    const updates = mocks.calls.filter((call) => call.method === 'update');
    expect(updates[updates.length - 1]?.args[0]).toEqual({
      status: 'queued',
      next_attempt_at: '2026-08-16T10:00:00Z',
      lease_owner: null,
      lease_expires_at: null,
      updated_at: now.toISOString(),
    });

    queue({ data: null, error: null });
    await expect(
      releaseSocialPublishJobLease({
        jobId: 'job-lost',
        owner: 'mac:1',
        scheduledAt: '2026-08-16T10:00:00Z',
        now,
      }),
    ).rejects.toThrow('lease was lost');
  });
});
