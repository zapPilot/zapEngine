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

interface QueueSnapshotFixtureOptions {
  jobsError?: unknown;
  localizationData?: LocalizationFixture[] | null;
  localizationError?: unknown;
}

const jobs: QueueJobFixture[] = [
  {
    episode_id: 'episode-missing-title',
    platform: 'threads',
    status: 'queued',
    scheduled_at: '2026-08-21T12:00:00.000Z',
    next_attempt_at: '2026-08-21T12:00:00.000Z',
  },
  {
    episode_id: 'episode-missing-title',
    platform: 'x',
    status: 'failed',
    scheduled_at: '2026-08-21T07:00:00.000Z',
    next_attempt_at: '2026-08-21T10:00:00.000Z',
  },
  {
    episode_id: 'episode-titled',
    platform: 'threads',
    status: 'processing',
    scheduled_at: '2026-08-21T09:00:00.000Z',
    next_attempt_at: '2026-08-21T06:00:00.000Z',
  },
  {
    episode_id: 'episode-null-title',
    platform: 'x',
    status: 'queued',
    scheduled_at: '2026-08-21T13:00:00.000Z',
    next_attempt_at: '2026-08-21T13:00:00.000Z',
  },
];

const localizations: LocalizationFixture[] = [
  { episode_id: 'episode-titled', title: 'Titled episode' },
  { episode_id: 'episode-null-title', title: null },
];

function createQueueSnapshotFixture(options: QueueSnapshotFixtureOptions = {}) {
  const fixture = createQueueSnapshotReadFixture({
    jobs,
    jobsError: options.jobsError,
    localizationData:
      options.localizationData === undefined
        ? localizations
        : options.localizationData,
    localizationError: options.localizationError,
  });
  supabase.getPipelineSupabase.mockReturnValue(fixture.client);
  return fixture;
}

describe('getSocialQueueSnapshot missing localization titles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps ordering and deduplication when titles are missing or explicitly null', async () => {
    createQueueSnapshotFixture();

    await expect(getSocialQueueSnapshot()).resolves.toEqual({
      pendingCount: 4,
      episodeQueue: [
        {
          episodeId: 'episode-titled',
          title: 'Titled episode',
          nextAt: '2026-08-21T09:00:00.000Z',
        },
        {
          episodeId: 'episode-missing-title',
          title: null,
          nextAt: '2026-08-21T10:00:00.000Z',
        },
        {
          episodeId: 'episode-null-title',
          title: null,
          nextAt: '2026-08-21T13:00:00.000Z',
        },
      ],
      nextByPlatform: {
        threads: {
          episodeId: 'episode-titled',
          platform: 'threads',
          status: 'processing',
          title: 'Titled episode',
          nextAt: '2026-08-21T09:00:00.000Z',
        },
        x: {
          episodeId: 'episode-missing-title',
          platform: 'x',
          status: 'failed',
          title: null,
          nextAt: '2026-08-21T10:00:00.000Z',
        },
      },
    });
  });

  it('propagates pending-job read failures before localization enrichment', async () => {
    const jobsError = new Error('publish jobs read failed');
    const fixture = createQueueSnapshotFixture({ jobsError });

    await expect(getSocialQueueSnapshot()).rejects.toBe(jobsError);
    expect(supabase.throwSupabaseError).toHaveBeenCalledWith(jobsError);
    expect(fixture.from).toHaveBeenCalledTimes(1);
    expect(fixture.from).toHaveBeenCalledWith('social_publish_jobs');
  });

  it('propagates localization read failures instead of returning a partial snapshot', async () => {
    const localizationError = new Error('localization read failed');
    createQueueSnapshotFixture({ localizationError });

    await expect(getSocialQueueSnapshot()).rejects.toBe(localizationError);
    expect(supabase.throwSupabaseError).toHaveBeenCalledWith(localizationError);
  });
});
