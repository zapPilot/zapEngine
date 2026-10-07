import { describe, expect, it } from 'vitest';

import { parseStoredPodcastProgress } from '@/storage/podcastStorageCore';

describe('parseStoredPodcastProgress finite positions', () => {
  it('drops an entry whose numeric position overflows JSON parsing to Infinity', () => {
    expect(
      parseStoredPodcastProgress(
        '{"overflow":{"listened":false,"lastPositionSeconds":1e999}}',
      ),
    ).toEqual({});
  });
});
