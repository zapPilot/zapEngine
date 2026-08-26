import { vi } from 'vitest';

export interface QueueJobFixture {
  episode_id: string;
  platform: 'threads' | 'x';
  language_code?: 'zh-Hant' | 'ja' | 'en';
  status: 'queued' | 'failed' | 'processing';
  scheduled_at: string;
  next_attempt_at: string;
  attempt_count?: number;
}

export interface LocalizationFixture {
  episode_id: string;
  language_code?: 'zh-Hant' | 'ja' | 'en';
  title: string | null;
}

export interface QueueSnapshotFixtureOptions {
  jobs: QueueJobFixture[] | null;
  jobsError?: unknown;
  localizationData: LocalizationFixture[] | null;
  localizationError?: unknown;
}

interface QueueSnapshotReadFixture {
  client: { from: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
  jobStatusFilter: ReturnType<typeof vi.fn>;
  localizationEpisodeFilter: ReturnType<typeof vi.fn>;
}

export function createQueueSnapshotReadFixture({
  jobs,
  jobsError,
  localizationData,
  localizationError,
}: QueueSnapshotFixtureOptions): QueueSnapshotReadFixture {
  const jobReturns = vi.fn().mockResolvedValue({
    data: jobs?.map((job) => ({ attempt_count: 0, ...job })) ?? jobs,
    error: jobsError ?? null,
  });
  const jobStatusFilter = vi.fn(() => ({ returns: jobReturns }));
  const jobSelect = vi.fn(() => ({ in: jobStatusFilter }));

  const localizationReturns = vi.fn().mockResolvedValue({
    data: localizationData,
    error: localizationError ?? null,
  });
  const localizationEpisodeFilter = vi.fn(() => ({
    returns: localizationReturns,
  }));
  const localizationSelect = vi.fn(() => ({
    in: localizationEpisodeFilter,
  }));

  const from = vi.fn((table: string) => {
    if (table === 'social_publish_jobs') return { select: jobSelect };
    if (table === 'episode_localizations') {
      return { select: localizationSelect };
    }
    throw new Error(`Unexpected Supabase table: ${table}`);
  });

  return {
    client: { from },
    from,
    jobStatusFilter,
    localizationEpisodeFilter,
  };
}
