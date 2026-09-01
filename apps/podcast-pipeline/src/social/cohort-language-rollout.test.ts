import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOrCreateExperimentAssignment: vi.fn(),
}));

vi.mock('./experiments.js', () => ({
  getOrCreateExperimentAssignment: mocks.getOrCreateExperimentAssignment,
}));

import {
  resolveReleaseCohortLanes,
  resolveRequiredReleaseLanguages,
} from './cohort.js';

const EPISODE_ID = '123e4567-e89b-42d3-a456-426614174000';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrCreateExperimentAssignment.mockImplementation(
    async ({
      experimentKey,
      episodeId,
    }: {
      experimentKey: string;
      episodeId: string;
    }) => ({
      experiment_key: experimentKey,
      episode_id: episodeId,
      variant: 'ja',
      assigned_at: '2026-08-31T00:00:00.000Z',
    }),
  );
});

describe('social language experiment rollout', () => {
  it('keeps an episode created before activation on the legacy lane shape even when scheduled later', async () => {
    const scheduledAt = new Date('2026-09-02T03:00:00.000Z'); // 12:00 JST
    const lanes = await resolveReleaseCohortLanes({
      episodeId: EPISODE_ID,
      episodeCreatedAt: '2026-08-31T23:59:59.999Z',
      scheduledAt,
    });

    expect(
      lanes.map(({ platform, language }) => ({ platform, language })),
    ).toEqual([
      { platform: 'rednote', language: 'zh-Hant' },
      { platform: 'threads', language: 'ja' },
      { platform: 'x', language: 'ja' },
      { platform: 'youtube', language: 'en' },
    ]);
    expect(mocks.getOrCreateExperimentAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ experimentKey: 'x-language-v1' }),
    );
  });

  it('requires all three languages for an episode created after activation', async () => {
    await expect(
      resolveRequiredReleaseLanguages({
        episodeId: EPISODE_ID,
        episodeCreatedAt: '2026-09-01T00:00:00.000Z',
        prospectiveScheduledAt: new Date('2026-09-01T03:00:00.000Z'),
      }),
    ).resolves.toEqual(['zh-Hant', 'ja', 'en']);
    expect(mocks.getOrCreateExperimentAssignment).not.toHaveBeenCalled();
  });
});
