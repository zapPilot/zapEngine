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
          platform: 'threads',
          status: 'failed',
          title: 'Failed episode',
          nextAt: '2026-08-21T11:00:00.000Z',
        },
        x: {
          episodeId: 'episode-processing',
          platform: 'x',
          status: 'processing',
          title: 'Processing episode',
          nextAt: '2026-08-21T12:00:00.000Z',
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
      platform: 'x',
      status: 'failed',
      title: 'Failed episode',
      nextAt: '2026-08-21T11:00:00.000Z',
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
      platform: 'x',
      status: 'failed',
      title: 'Failed episode',
      nextAt: '2026-08-21T10:00:00.000Z',
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
        platform: 'threads',
        status: 'processing',
        title: 'Other episode',
        nextAt: '2026-08-21T09:00:00.000Z',
      },
      x: {
        episodeId: 'episode-shared',
        platform: 'x',
        status: 'failed',
        title: 'Shared episode',
        nextAt: '2026-08-21T10:00:00.000Z',
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
          platform: 'threads',
          status: 'failed',
          title: null,
          nextAt: '2026-08-21T11:00:00.000Z',
        },
        x: {
          episodeId: 'episode-processing',
          platform: 'x',
          status: 'processing',
          title: null,
          nextAt: '2026-08-21T12:00:00.000Z',
        },
      },
    });
  });
});
