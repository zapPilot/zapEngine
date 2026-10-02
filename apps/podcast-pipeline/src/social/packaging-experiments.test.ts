import { describe, expect, it } from 'vitest';

import {
  activePackagingExperiment,
  resolvePackagingAssignments,
} from './packaging-experiments.js';

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
  });
});
