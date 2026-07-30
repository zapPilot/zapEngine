import { describe, expect, it } from 'vitest';

import { sortEpisodes } from '@/components/podcast/episodeSorting';
import { createPodcastEpisode } from './support/podcastEpisode';

const older = createPodcastEpisode({
  id: 'a',
  createdAt: '2026-07-01T00:00:00.000Z',
});
const newer = createPodcastEpisode({
  id: 'b',
  createdAt: '2026-07-10T00:00:00.000Z',
});

describe('sortEpisodes', () => {
  it('orders newest first', () => {
    const result = sortEpisodes([older, newer], 'newest');
    expect(result.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('orders oldest first', () => {
    const result = sortEpisodes([newer, older], 'oldest');
    expect(result.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('breaks ties by id deterministically', () => {
    const first = createPodcastEpisode({
      id: 'a',
      createdAt: '2026-07-05T00:00:00.000Z',
    });
    const second = createPodcastEpisode({
      id: 'b',
      createdAt: '2026-07-05T00:00:00.000Z',
    });
    expect(sortEpisodes([first, second], 'oldest').map((e) => e.id)).toEqual([
      'a',
      'b',
    ]);
    expect(sortEpisodes([first, second], 'newest').map((e) => e.id)).toEqual([
      'b',
      'a',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [newer, older];
    sortEpisodes(input, 'oldest');
    expect(input.map((e) => e.id)).toEqual(['b', 'a']);
  });
});
