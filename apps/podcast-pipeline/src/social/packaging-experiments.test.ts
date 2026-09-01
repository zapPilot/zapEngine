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
  mocks.getOrCreateExperimentAssignment.mockResolvedValue({
    experiment_key: 'rednote-packaging-v1-zh-Hant',
    episode_id: 'episode-1',
    variant: 'hook_first',
    assigned_at: '2026-08-30T00:00:00.000Z',
  });
});

describe('packaging experiments', () => {
  it('keeps Rednote active while X, Threads, and YouTube language tests stay unconfounded', () => {
    expect(activePackagingExperiment('rednote', 'zh-Hant')?.key).toBe(
      'rednote-packaging-v1-zh-Hant',
    );
    for (const platform of ['x', 'threads', 'youtube'] as const) {
      for (const language of ['zh-Hant', 'ja', 'en'] as const) {
        expect(activePackagingExperiment(platform, language)).toBeUndefined();
      }
    }
  });

  it('creates no packaging assignment for a rotating language lane', async () => {
    await expect(
      resolvePackagingAssignments({
        episodeId: 'episode-1',
        languageCode: 'ja',
        platforms: ['threads', 'x', 'youtube'],
      }),
    ).resolves.toEqual({});
    expect(mocks.getOrCreateExperimentAssignment).not.toHaveBeenCalled();
  });

  it('still resolves the Rednote packaging treatment', async () => {
    await expect(
      resolvePackagingAssignments({
        episodeId: 'episode-1',
        languageCode: 'zh-Hant',
        platforms: ['rednote'],
      }),
    ).resolves.toEqual({
      rednote: expect.objectContaining({
        key: 'rednote-packaging-v1-zh-Hant',
        variant: 'hook_first',
      }),
    });
  });

  it('fails loudly when the Rednote persisted variant is no longer registered', async () => {
    mocks.getOrCreateExperimentAssignment.mockResolvedValue({
      experiment_key: 'rednote-packaging-v1-zh-Hant',
      episode_id: 'episode-1',
      variant: 'retired',
      assigned_at: '2026-08-30T00:00:00.000Z',
    });
    await expect(
      resolvePackagingAssignments({
        episodeId: 'episode-1',
        languageCode: 'zh-Hant',
        platforms: ['rednote'],
      }),
    ).rejects.toThrow(/not registered/u);
  });
});
