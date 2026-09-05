import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabase);

import { getSocialQueueSnapshot } from './daemon-store.js';
import {
  createQueueSnapshotReadFixture,
  type LocalizationFixture,
  type QueueJobFixture,
} from './daemon-store-queue-snapshot.test-helper.js';

const defaultJobs: QueueJobFixture[] = [
  {
    episode_id: 'episode-processing',
    platform: 'x',
    status: 'processing',
    scheduled_at: '2026-08-21T12:00:00.000Z',
    next_attempt_at: '2026-08-21T08:00:00.000Z',
  },
  {
    episode_id: 'episode-failed',
    platform: 'threads',
    status: 'failed',
    scheduled_at: '2026-08-21T07:00:00.000Z',
    next_attempt_at: '2026-08-21T11:00:00.000Z',
  },
];

const defaultLocalizations: LocalizationFixture[] = [
  { episode_id: 'episode-processing', title: 'Processing episode' },
  { episode_id: 'episode-failed', title: 'Failed episode' },
];

function createQueueSnapshotFixture(
  jobs: QueueJobFixture[] | null = defaultJobs,
  localizations: LocalizationFixture[] | null = defaultLocalizations,
) {
  const fixture = createQueueSnapshotReadFixture({
    jobs,
    localizationData: localizations,
  });
  supabase.getPipelineSupabase.mockReturnValue(fixture.client);
  return fixture;
}

describe('getSocialQueueSnapshot processing timing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty snapshot without querying localizations when no jobs are pending', async () => {
    const fixture = createQueueSnapshotFixture([], []);

    await expect(getSocialQueueSnapshot()).resolves.toEqual({
      pendingCount: 0,
      episodeQueue: [],
      nextByPlatform: {},
    });
    expect(fixture.client.from).toHaveBeenCalledTimes(1);
    expect(fixture.client.from).toHaveBeenCalledWith('social_publish_jobs');
  });

  it('treats a null jobs result as an empty snapshot without enrichment reads', async () => {
    const fixture = createQueueSnapshotFixture(null, []);

    await expect(getSocialQueueSnapshot()).resolves.toEqual({
      pendingCount: 0,
      episodeQueue: [],
      nextByPlatform: {},
    });
    expect(fixture.client.from).toHaveBeenCalledTimes(1);
    expect(fixture.client.from).toHaveBeenCalledWith('social_publish_jobs');
  });

  it('keeps processing jobs pending but orders them by scheduled time', async () => {
    const { jobStatusFilter } = createQueueSnapshotFixture();

    await expect(getSocialQueueSnapshot()).resolves.toEqual({
      pendingCount: 2,
      episodeQueue: [
        {
          episodeId: 'episode-failed',
          title: 'Failed episode',
          nextAt: '2026-08-21T11:00:00.000Z',
        },
        {
          episodeId: 'episode-processing',
          title: 'Processing episode',
          nextAt: '2026-08-21T12:00:00.000Z',
        },
      ],
      nextByPlatform: {
        threads: {
          episodeId: 'episode-failed',
          languageCode: 'zh-Hant',
          platform: 'threads',
          status: 'failed',
          title: 'Failed episode',
          nextAt: '2026-08-21T11:00:00.000Z',
          attemptCount: 0,
          attemptsExhausted: false,
        },
        x: {
          episodeId: 'episode-processing',
          languageCode: 'zh-Hant',
          platform: 'x',
          status: 'processing',
          title: 'Processing episode',
          nextAt: '2026-08-21T12:00:00.000Z',
          attemptCount: 0,
          attemptsExhausted: false,
        },
      },
    });

    expect(jobStatusFilter).toHaveBeenCalledWith('status', [
      'queued',
      'failed',
      'processing',
    ]);
  });

  it('chooses the earliest effective time when failed and processing jobs share a platform', async () => {
    createQueueSnapshotFixture(
      [
        {
          episode_id: 'episode-processing',
          platform: 'x',
          status: 'processing',
          scheduled_at: '2026-08-21T12:00:00.000Z',
          next_attempt_at: '2026-08-21T07:00:00.000Z',
        },
        {
          episode_id: 'episode-failed',
          platform: 'x',
          status: 'failed',
          scheduled_at: '2026-08-21T08:00:00.000Z',
          next_attempt_at: '2026-08-21T11:00:00.000Z',
        },
      ],
      defaultLocalizations,
    );

    const snapshot = await getSocialQueueSnapshot();

    expect(snapshot.episodeQueue).toEqual([
      {
        episodeId: 'episode-failed',
        title: 'Failed episode',
        nextAt: '2026-08-21T11:00:00.000Z',
      },
      {
        episodeId: 'episode-processing',
        title: 'Processing episode',
        nextAt: '2026-08-21T12:00:00.000Z',
      },
    ]);
    expect(snapshot.nextByPlatform.x).toEqual({
      episodeId: 'episode-failed',
      languageCode: 'zh-Hant',
      platform: 'x',
      status: 'failed',
      title: 'Failed episode',
      nextAt: '2026-08-21T11:00:00.000Z',
      attemptCount: 0,
      attemptsExhausted: false,
    });
  });

  it('chooses by effective time across queued failed and processing rows regardless of row order', async () => {
    createQueueSnapshotFixture(
      [
        {
          episode_id: 'episode-processing',
          platform: 'x',
          status: 'processing',
          scheduled_at: '2026-08-21T13:00:00.000Z',
          next_attempt_at: '2026-08-21T06:00:00.000Z',
        },
        {
          episode_id: 'episode-queued',
          platform: 'x',
          status: 'queued',
          scheduled_at: '2026-08-21T12:00:00.000Z',
          next_attempt_at: '2026-08-21T12:00:00.000Z',
        },
        {
          episode_id: 'episode-failed',
          platform: 'x',
          status: 'failed',
          scheduled_at: '2026-08-21T09:00:00.000Z',
          next_attempt_at: '2026-08-21T10:00:00.000Z',
        },
      ],
      [
        { episode_id: 'episode-processing', title: 'Processing episode' },
        { episode_id: 'episode-queued', title: 'Queued episode' },
        { episode_id: 'episode-failed', title: 'Failed episode' },
      ],
    );

    const snapshot = await getSocialQueueSnapshot();

    expect(snapshot.episodeQueue).toEqual([
      {
        episodeId: 'episode-failed',
        title: 'Failed episode',
        nextAt: '2026-08-21T10:00:00.000Z',
      },
      {
        episodeId: 'episode-queued',
        title: 'Queued episode',
        nextAt: '2026-08-21T12:00:00.000Z',
      },
      {
        episodeId: 'episode-processing',
        title: 'Processing episode',
        nextAt: '2026-08-21T13:00:00.000Z',
      },
    ]);
    expect(snapshot.nextByPlatform.x).toEqual({
      episodeId: 'episode-failed',
      languageCode: 'zh-Hant',
      platform: 'x',
      status: 'failed',
      title: 'Failed episode',
      nextAt: '2026-08-21T10:00:00.000Z',
      attemptCount: 0,
      attemptsExhausted: false,
    });
  });

  it('deduplicates episodes by earliest effective time while keeping platform queues independent', async () => {
    createQueueSnapshotFixture(
      [
        {
          episode_id: 'episode-shared',
          platform: 'threads',
          status: 'queued',
          scheduled_at: '2026-08-21T12:00:00.000Z',
          next_attempt_at: '2026-08-21T12:00:00.000Z',
        },
        {
          episode_id: 'episode-shared',
          platform: 'x',
          status: 'failed',
          scheduled_at: '2026-08-21T07:00:00.000Z',
          next_attempt_at: '2026-08-21T10:00:00.000Z',
        },
        {
          episode_id: 'episode-other',
          platform: 'threads',
          status: 'processing',
          scheduled_at: '2026-08-21T09:00:00.000Z',
          next_attempt_at: '2026-08-21T06:00:00.000Z',
        },
      ],
      [
        { episode_id: 'episode-shared', title: 'Shared episode' },
        { episode_id: 'episode-other', title: 'Other episode' },
      ],
    );

    const snapshot = await getSocialQueueSnapshot();

    expect(snapshot.pendingCount).toBe(3);
    expect(snapshot.episodeQueue).toEqual([
      {
        episodeId: 'episode-other',
        title: 'Other episode',
        nextAt: '2026-08-21T09:00:00.000Z',
      },
      {
        episodeId: 'episode-shared',
        title: 'Shared episode',
        nextAt: '2026-08-21T10:00:00.000Z',
      },
    ]);
    expect(snapshot.nextByPlatform).toEqual({
      threads: {
        episodeId: 'episode-other',
        languageCode: 'zh-Hant',
        platform: 'threads',
        status: 'processing',
        title: 'Other episode',
        nextAt: '2026-08-21T09:00:00.000Z',
        attemptCount: 0,
        attemptsExhausted: false,
      },
      x: {
        episodeId: 'episode-shared',
        languageCode: 'zh-Hant',
        platform: 'x',
        status: 'failed',
        title: 'Shared episode',
        nextAt: '2026-08-21T10:00:00.000Z',
        attemptCount: 0,
        attemptsExhausted: false,
      },
    });
  });

  it('keeps queue timing intact when localization data is null', async () => {
    createQueueSnapshotFixture(defaultJobs, null);

    await expect(getSocialQueueSnapshot()).resolves.toEqual({
      pendingCount: 2,
      episodeQueue: [
        {
          episodeId: 'episode-failed',
          title: null,
          nextAt: '2026-08-21T11:00:00.000Z',
        },
        {
          episodeId: 'episode-processing',
          title: null,
          nextAt: '2026-08-21T12:00:00.000Z',
        },
      ],
      nextByPlatform: {
        threads: {
          episodeId: 'episode-failed',
          languageCode: 'zh-Hant',
          platform: 'threads',
          status: 'failed',
          title: null,
          nextAt: '2026-08-21T11:00:00.000Z',
          attemptCount: 0,
          attemptsExhausted: false,
        },
        x: {
          episodeId: 'episode-processing',
          languageCode: 'zh-Hant',
          platform: 'x',
          status: 'processing',
          title: null,
          nextAt: '2026-08-21T12:00:00.000Z',
          attemptCount: 0,
          attemptsExhausted: false,
        },
      },
    });
  });
});

describe('getSocialQueueSnapshot claim-gate reporting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The queue log is the only place an operator sees a lane's next action, so
  // it has to agree with `claim_social_publish_batch`, which needs both
  // `scheduled_at` and `next_attempt_at` to be in the past.
  it('reports a queued lane held back by next_attempt_at, not its stale schedule', async () => {
    createQueueSnapshotFixture(
      [
        {
          episode_id: 'episode-failed',
          platform: 'x',
          status: 'queued',
          scheduled_at: '2026-08-21T08:00:00.000Z',
          next_attempt_at: '2026-08-22T00:30:00.000Z',
        },
      ],
      defaultLocalizations,
    );

    const snapshot = await getSocialQueueSnapshot();

    expect(snapshot.nextByPlatform.x?.nextAt).toBe('2026-08-22T00:30:00.000Z');
    expect(snapshot.episodeQueue[0]?.nextAt).toBe('2026-08-22T00:30:00.000Z');
  });

  it('keeps reporting scheduled_at when it is the later of the two claim gates', async () => {
    createQueueSnapshotFixture(
      [
        {
          episode_id: 'episode-failed',
          platform: 'x',
          status: 'queued',
          scheduled_at: '2026-08-22T00:30:00.000Z',
          next_attempt_at: '2026-08-21T08:00:00.000Z',
        },
      ],
      defaultLocalizations,
    );

    const snapshot = await getSocialQueueSnapshot();

    expect(snapshot.nextByPlatform.x?.nextAt).toBe('2026-08-22T00:30:00.000Z');
  });

  it('flags a lane that has burned every claim attempt', async () => {
    createQueueSnapshotFixture(
      [
        {
          episode_id: 'episode-failed',
          platform: 'x',
          status: 'failed',
          scheduled_at: '2026-08-21T08:00:00.000Z',
          next_attempt_at: '2026-08-21T09:00:00.000Z',
          attempt_count: 8,
        },
        {
          episode_id: 'episode-processing',
          platform: 'threads',
          status: 'failed',
          scheduled_at: '2026-08-21T08:00:00.000Z',
          next_attempt_at: '2026-08-21T09:00:00.000Z',
          attempt_count: 7,
        },
      ],
      defaultLocalizations,
    );

    const snapshot = await getSocialQueueSnapshot();

    expect(snapshot.nextByPlatform.x?.attemptsExhausted).toBe(true);
    expect(snapshot.nextByPlatform.threads?.attemptsExhausted).toBe(false);
  });
});

it('includes the processing lease in both article and lane timing', async () => {
  createQueueSnapshotFixture(
    [
      {
        episode_id: 'episode-processing',
        platform: 'x',
        status: 'processing',
        scheduled_at: '2026-09-05T00:30:00.000Z',
        next_attempt_at: '2026-09-05T00:30:00.000Z',
        lease_expires_at: '2026-09-05T01:30:47.000Z',
      },
    ],
    defaultLocalizations,
  );
  const snapshot = await getSocialQueueSnapshot();
  expect(snapshot.episodeQueue[0]?.nextAt).toBe('2026-09-05T01:30:47.000Z');
  expect(snapshot.nextByLane['x|zh-Hant']?.nextAt).toBe(
    '2026-09-05T01:30:47.000Z',
  );
});
