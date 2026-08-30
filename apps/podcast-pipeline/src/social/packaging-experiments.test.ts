import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOrCreateExperimentAssignment: vi.fn(),
}));

vi.mock('./experiments.js', () => ({
  getOrCreateExperimentAssignment: mocks.getOrCreateExperimentAssignment,
}));

import {
  activePackagingExperiment,
  resolvePackagingAssignments,
} from './packaging-experiments.js';

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
      variant: experimentKey.includes('threads')
        ? 'conversation'
        : 'hook_first',
      assigned_at: '2026-08-30T00:00:00.000Z',
    }),
  );
});

describe('packaging experiments', () => {
  it('activates only the registered platform-language lanes and never X', () => {
    expect(activePackagingExperiment('rednote', 'zh-Hant')?.key).toBe(
      'rednote-packaging-v1-zh-Hant',
    );
    expect(activePackagingExperiment('threads', 'ja')?.key).toBe(
      'threads-packaging-v1-ja',
    );
    expect(activePackagingExperiment('threads', 'en')).toBeUndefined();
    expect(activePackagingExperiment('x', 'ja')).toBeUndefined();
  });

  it('uses one language-neutral YouTube key so EN and JA resolve the same persisted arm', async () => {
    for (const languageCode of ['en', 'ja'] as const) {
      await resolvePackagingAssignments({
        episodeId: 'episode-1',
        languageCode,
        platforms: ['youtube'],
      });
    }
    expect(
      mocks.getOrCreateExperimentAssignment.mock.calls.map(([input]) => input),
    ).toEqual([
      expect.objectContaining({
        experimentKey: 'youtube-title-packaging-v1',
        episodeId: 'episode-1',
      }),
      expect.objectContaining({
        experimentKey: 'youtube-title-packaging-v1',
        episodeId: 'episode-1',
      }),
    ]);
  });

  it('fails loudly when a persisted variant is no longer registered', async () => {
    mocks.getOrCreateExperimentAssignment.mockResolvedValue({
      experiment_key: 'threads-packaging-v1-ja',
      episode_id: 'episode-1',
      variant: 'retired',
      assigned_at: '2026-08-30T00:00:00.000Z',
    });
    await expect(
      resolvePackagingAssignments({
        episodeId: 'episode-1',
        languageCode: 'ja',
        platforms: ['threads'],
      }),
    ).rejects.toThrow(/not registered/u);
  });
});
