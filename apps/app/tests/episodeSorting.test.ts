import { describe, expect, it } from 'vitest';

import { sortEpisodes } from '@/components/podcast/episodeSorting';
import type { PodcastEpisode } from '@/integration/podcastFeed';

function makeEpisode(id: string, createdAt: string): PodcastEpisode {
  return {
    id,
    localizationId: `loc-${id}`,
    title: id,
    languageCode: 'zh-Hant',
    hlsUrl: 'https://example.com/a.m3u8',
    createdAt,
    listened: false,
    likeCount: 0,
    script: null,
    audioTracks: [],
    languageClassrooms: [],
    lastPositionSeconds: 0,
  };
}

const older = makeEpisode('a', '2026-07-01T00:00:00.000Z');
const newer = makeEpisode('b', '2026-07-10T00:00:00.000Z');

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
    const first = makeEpisode('a', '2026-07-05T00:00:00.000Z');
    const second = makeEpisode('b', '2026-07-05T00:00:00.000Z');
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
