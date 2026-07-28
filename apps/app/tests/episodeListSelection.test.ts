import { describe, expect, it } from 'vitest';

import { selectPodcastLists } from '@/components/podcast/episodeListSelection';
import type { PodcastEpisode } from '@/integration/podcastFeed';

function makeEpisode(
  id: string,
  createdAt: string,
  languageCode: string,
  listened: boolean,
): PodcastEpisode {
  return {
    id,
    localizationId: `loc-${id}`,
    title: id,
    languageCode,
    hlsUrl: 'https://example.com/a.m3u8',
    createdAt,
    listened,
    likeCount: 0,
    script: null,
    video: null,
    audioTracks: [],
    languageClassrooms: [],
    lastPositionSeconds: 0,
  };
}

describe('selectPodcastLists', () => {
  const byLanguage = {
    'zh-Hant': [
      makeEpisode(
        'zh-old-unheard',
        '2026-07-01T00:00:00.000Z',
        'zh-Hant',
        false,
      ),
      makeEpisode(
        'zh-new-unheard',
        '2026-07-10T00:00:00.000Z',
        'zh-Hant',
        false,
      ),
      makeEpisode(
        'zh-old-listened',
        '2026-07-02T00:00:00.000Z',
        'zh-Hant',
        true,
      ),
      makeEpisode(
        'zh-new-listened',
        '2026-07-12T00:00:00.000Z',
        'zh-Hant',
        true,
      ),
    ],
    en: [makeEpisode('en-unheard', '2026-07-15T00:00:00.000Z', 'en', false)],
    ja: [makeEpisode('ja-listened', '2026-07-05T00:00:00.000Z', 'ja', true)],
  };

  it('returns only the selected language episodes in both sections', () => {
    const result = selectPodcastLists(byLanguage, 'zh-Hant', 'newest');
    expect(result.unheard.map((e) => e.id)).toEqual([
      'zh-new-unheard',
      'zh-old-unheard',
    ]);
    expect(result.listened.map((e) => e.id)).toEqual([
      'zh-new-listened',
      'zh-old-listened',
    ]);
  });

  it('excludes listened episodes from unheard and follows direction', () => {
    const newest = selectPodcastLists(byLanguage, 'zh-Hant', 'newest');
    expect(newest.unheard.map((e) => e.id)).toEqual([
      'zh-new-unheard',
      'zh-old-unheard',
    ]);

    const oldest = selectPodcastLists(byLanguage, 'zh-Hant', 'oldest');
    expect(oldest.unheard.map((e) => e.id)).toEqual([
      'zh-old-unheard',
      'zh-new-unheard',
    ]);
  });

  it('keeps listened newest-first even when direction is oldest', () => {
    const result = selectPodcastLists(byLanguage, 'zh-Hant', 'oldest');
    expect(result.listened.map((e) => e.id)).toEqual([
      'zh-new-listened',
      'zh-old-listened',
    ]);
  });

  it('returns empty lists for an unknown language code', () => {
    const result = selectPodcastLists(byLanguage, 'fr', 'newest');
    expect(result.unheard).toEqual([]);
    expect(result.listened).toEqual([]);
  });
});
