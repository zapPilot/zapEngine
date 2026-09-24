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
});

describe('packaging experiments', () => {
  it('has no active platform-specific title experiment', () => {
    for (const platform of ['rednote', 'x', 'threads', 'youtube'] as const) {
      for (const language of ['zh-Hant', 'ja', 'en'] as const) {
        expect(activePackagingExperiment(platform, language)).toBeUndefined();
      }
    }
  });

  it('creates no packaging assignments for any lane', async () => {
    await expect(
      resolvePackagingAssignments({
        episodeId: 'episode-1',
        languageCode: 'zh-Hant',
        platforms: ['rednote', 'threads', 'x', 'youtube'],
      }),
    ).resolves.toEqual({});
    expect(mocks.getOrCreateExperimentAssignment).not.toHaveBeenCalled();
  });
});
