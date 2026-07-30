import { describe, expect, it } from 'vitest';

import {
  selectPlayUnheardTarget,
  selectPodcastLists,
} from '@/components/podcast/episodeListSelection';
import { createPodcastEpisode } from './support/podcastEpisode';

describe('selectPodcastLists', () => {
  const byLanguage = {
    'zh-Hant': [
      createPodcastEpisode({
        id: 'zh-old-unheard',
        createdAt: '2026-07-01T00:00:00.000Z',
        languageCode: 'zh-Hant',
        listened: false,
      }),
      createPodcastEpisode({
        id: 'zh-new-unheard',
        createdAt: '2026-07-10T00:00:00.000Z',
        languageCode: 'zh-Hant',
        listened: false,
      }),
      createPodcastEpisode({
        id: 'zh-old-listened',
        createdAt: '2026-07-02T00:00:00.000Z',
        languageCode: 'zh-Hant',
        listened: true,
      }),
      createPodcastEpisode({
        id: 'zh-new-listened',
        createdAt: '2026-07-12T00:00:00.000Z',
        languageCode: 'zh-Hant',
        listened: true,
      }),
    ],
    en: [
      createPodcastEpisode({
        id: 'en-unheard',
        createdAt: '2026-07-15T00:00:00.000Z',
        languageCode: 'en',
        listened: false,
      }),
    ],
    ja: [
      createPodcastEpisode({
        id: 'ja-listened',
        createdAt: '2026-07-05T00:00:00.000Z',
        languageCode: 'ja',
        listened: true,
      }),
    ],
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

describe('selectPlayUnheardTarget', () => {
  it('returns an empty selection for an empty feed', () => {
    expect(selectPlayUnheardTarget([], 'newest')).toEqual({
      mode: 'empty',
      target: null,
      queue: [],
    });
  });

  it('prioritises in-progress episodes before sorted unplayed episodes', () => {
    const inProgress = createPodcastEpisode({
      id: 'in-progress',
      createdAt: '2026-07-01T00:00:00.000Z',
      languageCode: 'zh-Hant',
      listened: false,
      lastPositionSeconds: 20,
    });
    const newerUnplayed = createPodcastEpisode({
      id: 'newer-unplayed',
      createdAt: '2026-07-12T00:00:00.000Z',
      languageCode: 'zh-Hant',
      listened: false,
    });
    const olderUnplayed = createPodcastEpisode({
      id: 'older-unplayed',
      createdAt: '2026-07-02T00:00:00.000Z',
      languageCode: 'zh-Hant',
      listened: false,
    });

    const result = selectPlayUnheardTarget(
      [newerUnplayed, inProgress, olderUnplayed],
      'oldest',
    );

    expect(result.mode).toBe('inProgress');
    expect(result.target?.id).toBe('in-progress');
    expect(result.queue.map((episode) => episode.id)).toEqual([
      'in-progress',
      'older-unplayed',
      'newer-unplayed',
    ]);
  });

  it('sorts the completed replay queue in the requested direction', () => {
    const older = createPodcastEpisode({
      id: 'older',
      createdAt: '2026-07-01T00:00:00.000Z',
      languageCode: 'zh-Hant',
      listened: true,
    });
    const newer = createPodcastEpisode({
      id: 'newer',
      createdAt: '2026-07-12T00:00:00.000Z',
      languageCode: 'zh-Hant',
      listened: true,
    });

    expect(
      selectPlayUnheardTarget([older, newer], 'newest').queue.map(
        (episode) => episode.id,
      ),
    ).toEqual(['newer', 'older']);
    expect(
      selectPlayUnheardTarget([older, newer], 'oldest').queue.map(
        (episode) => episode.id,
      ),
    ).toEqual(['older', 'newer']);
  });
});
