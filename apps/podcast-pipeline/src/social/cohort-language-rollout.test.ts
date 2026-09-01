import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOrCreateExperimentAssignment: vi.fn(),
  assignments: new Map<string, string>(),
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
  mocks.assignments.clear();
  mocks.getOrCreateExperimentAssignment.mockImplementation(
    async ({
      experimentKey,
      episodeId,
      variants = ['en', 'ja'],
    }: {
      experimentKey: string;
      episodeId: string;
      variants?: readonly [string, ...string[]];
    }) => {
      const key = `${experimentKey}|${episodeId}`;
      const existing = mocks.assignments.get(key);
      const variant =
        existing ?? (experimentKey === 'x-language-v1' ? 'ja' : variants[0]);
      mocks.assignments.set(key, variant);
      return {
        experiment_key: experimentKey,
        episode_id: episodeId,
        variant,
        assigned_at: '2026-09-01T00:00:00.000Z',
      };
    },
  );
});

describe('social language experiment rollout', () => {
  it('keeps an episode created before activation on the legacy lane shape even when scheduled later', async () => {
    const scheduledAt = new Date('2026-09-03T03:00:00.000Z'); // 12:00 JST
    const lanes = await resolveReleaseCohortLanes({
      episodeId: EPISODE_ID,
      episodeCreatedAt: '2026-09-01T23:59:59.999Z',
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
        episodeCreatedAt: '2026-09-02T00:00:00.000Z',
        prospectiveScheduledAt: new Date('2026-09-02T03:00:00.000Z'),
      }),
    ).resolves.toEqual(['zh-Hant', 'ja', 'en']);
    expect(mocks.getOrCreateExperimentAssignment).not.toHaveBeenCalled();
  });

  it('persists the slot-derived v2 profile before enqueue and reuses it after rescheduling', async () => {
    const first = await resolveReleaseCohortLanes({
      episodeId: EPISODE_ID,
      episodeCreatedAt: '2026-09-02T00:00:00.000Z',
      scheduledAt: new Date('2026-09-02T03:00:00.000Z'), // Day 1 12:00 JST = B
    });
    const repaired = await resolveReleaseCohortLanes({
      episodeId: EPISODE_ID,
      episodeCreatedAt: '2026-09-02T00:00:00.000Z',
      scheduledAt: new Date('2026-09-02T07:00:00.000Z'), // Day 1 16:00 JST = C
    });

    expect(first).toEqual(repaired);
    expect(
      first.map(({ platform, language }) => ({ platform, language })),
    ).toEqual([
      { platform: 'x', language: 'ja' },
      { platform: 'threads', language: 'zh-Hant' },
      { platform: 'youtube', language: 'en' },
      { platform: 'rednote', language: 'zh-Hant' },
    ]);
    expect(mocks.getOrCreateExperimentAssignment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        experimentKey: 'social-language-profile-v2',
        variants: ['B'],
      }),
    );
    expect(mocks.getOrCreateExperimentAssignment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        experimentKey: 'social-language-profile-v2',
        variants: ['C'],
      }),
    );
  });
});
