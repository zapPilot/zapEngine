import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({
  getPipelineSupabase: vi.fn(),
  throwSupabaseError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

vi.mock('../services/supabase-client.js', () => supabase);

import { getSocialQueueSnapshot } from './daemon-store.js';
import { createQueueSnapshotReadFixture } from './daemon-store-queue-snapshot.test-helper.js';

describe('getSocialQueueSnapshot localization query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries pending jobs and multilingual localizations with deduplicated episode ids', async () => {
    const fixture = createQueueSnapshotReadFixture({
      jobs: [
        {
          episode_id: 'episode-shared',
          platform: 'threads',
          status: 'queued',
          scheduled_at: '2026-08-21T10:00:00.000Z',
          next_attempt_at: '2026-08-21T10:00:00.000Z',
        },
        {
          episode_id: 'episode-shared',
          platform: 'x',
          status: 'failed',
          scheduled_at: '2026-08-21T09:00:00.000Z',
          next_attempt_at: '2026-08-21T11:00:00.000Z',
        },
        {
          episode_id: 'episode-other',
          platform: 'threads',
          status: 'processing',
          scheduled_at: '2026-08-21T12:00:00.000Z',
          next_attempt_at: '2026-08-21T08:00:00.000Z',
        },
      ],
      localizationData: [
        { episode_id: 'episode-shared', title: 'Shared episode' },
        { episode_id: 'episode-other', title: 'Other episode' },
      ],
    });
    supabase.getPipelineSupabase.mockReturnValue(fixture.client);

    await getSocialQueueSnapshot();

    expect(fixture.from).toHaveBeenCalledWith('social_publish_jobs');
    expect(fixture.jobStatusFilter).toHaveBeenCalledOnce();
    expect(fixture.jobStatusFilter).toHaveBeenCalledWith('status', [
      'queued',
      'failed',
      'processing',
    ]);
    expect(fixture.client.from).toHaveBeenCalledWith('episode_localizations');
    expect(fixture.localizationEpisodeFilter).toHaveBeenCalledOnce();
    expect(fixture.localizationEpisodeFilter).toHaveBeenCalledWith(
      'episode_id',
      ['episode-shared', 'episode-other'],
    );
  });
});
