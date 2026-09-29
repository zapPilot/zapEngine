import { describe, expect, it } from 'vitest';

import { readControlCenterConfig } from '../../config/env.js';
import { readPosthogGrowthLanes } from './posthog.js';
import { posthogQueryFetch } from './posthog-testing.js';

const config = readControlCenterConfig({
  POSTHOG_PERSONAL_API_KEY: 'key',
  POSTHOG_PROJECT_ID: '123',
});

describe('posthog growth lanes unknown platform', () => {
  it('normalizes null, empty, and whitespace platforms to unknown', async () => {
    const result = await readPosthogGrowthLanes({
      config,
      fetchImpl: posthogQueryFetch({
        lanes: [
          ['e1', null, 'en', 3, 1, 0],
          ['e2', '', 'en', 2, 1, 0],
          ['e3', '   ', null, 1, 0, 0],
          ['e4', '  YouTube  ', '  ', 5, 2, 1],
        ],
      }),
    });

    expect(result).toEqual([
      expect.objectContaining({
        episodeId: 'e1',
        platform: 'unknown',
        languageCode: 'en',
      }),
      expect.objectContaining({
        episodeId: 'e2',
        platform: 'unknown',
      }),
      expect.objectContaining({
        episodeId: 'e3',
        platform: 'unknown',
        languageCode: 'unknown',
      }),
      expect.objectContaining({
        episodeId: 'e4',
        platform: 'youtube',
        languageCode: 'unknown',
      }),
    ]);
  });
});
