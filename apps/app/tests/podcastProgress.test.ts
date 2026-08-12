import { describe, expect, it } from 'vitest';

import {
  mergeEpisodeProgress,
  type PodcastProgressMap,
  resolveEpisodeStatus,
  summariseCatalogCompletion,
} from '@/integration/podcastProgress';
import { createPodcastEpisodeFactory } from './support/podcastEpisode';

const makeEpisode = createPodcastEpisodeFactory({
  id: 'article-1',
  localizationId: 'loc-zh-1',
  hlsUrl: 'https://example.com/a.m3u8',
});

describe('resolveEpisodeStatus', () => {
  it('reports completed when listened, regardless of position', () => {
    expect(resolveEpisodeStatus(true, 0)).toBe('completed');
    expect(resolveEpisodeStatus(true, 500)).toBe('completed');
  });

  it('reports in-progress once past the minimum threshold', () => {
    expect(resolveEpisodeStatus(false, 6)).toBe('inProgress');
  });

  it('reports unplayed at or below the threshold', () => {
    expect(resolveEpisodeStatus(false, 0)).toBe('unplayed');
    expect(resolveEpisodeStatus(false, 5)).toBe('unplayed');
  });
});

describe('summariseCatalogCompletion', () => {
  it('reports a non-empty unheard catalog as 0%', () => {
    expect(summariseCatalogCompletion(['loc-1'], {})).toEqual({
      completed: 0,
      total: 1,
      percentage: 0,
    });
  });

  it('rounds the completed share of catalog episodes', () => {
    const progress: PodcastProgressMap = {
      'loc-1': { listened: true, lastPositionSeconds: 0 },
    };

    expect(
      summariseCatalogCompletion(['loc-1', 'loc-2', 'loc-3'], progress),
    ).toEqual({
      completed: 1,
      total: 3,
      percentage: 33,
    });
  });

  it('counts only locally listened catalog ids', () => {
    const progress: PodcastProgressMap = {
      'loc-1': { listened: true, lastPositionSeconds: 0 },
      'loc-2': { listened: false, lastPositionSeconds: 240 },
      'outside-catalog': { listened: true, lastPositionSeconds: 0 },
    };

    expect(summariseCatalogCompletion(['loc-1', 'loc-2'], progress)).toEqual({
      completed: 1,
      total: 2,
      percentage: 50,
    });
  });

  it('reports a fully completed catalog as 100%', () => {
    const progress: PodcastProgressMap = {
      'loc-1': { listened: true, lastPositionSeconds: 0 },
      'loc-2': { listened: true, lastPositionSeconds: 0 },
    };

    expect(summariseCatalogCompletion(['loc-1', 'loc-2'], progress)).toEqual({
      completed: 2,
      total: 2,
      percentage: 100,
    });
  });

  it('does not round an incomplete catalog up to 100%', () => {
    const catalogIds = Array.from(
      { length: 200 },
      (_, index) => `loc-${index}`,
    );
    const progress = Object.fromEntries(
      catalogIds
        .slice(0, 199)
        .map((id) => [id, { listened: true, lastPositionSeconds: 0 }]),
    );

    expect(summariseCatalogCompletion(catalogIds, progress).percentage).toBe(
      99,
    );
  });

  it('keeps an empty catalog at zero without dividing by zero', () => {
    expect(
      summariseCatalogCompletion([], {
        'outside-catalog': { listened: true, lastPositionSeconds: 0 },
      }),
    ).toEqual({
      completed: 0,
      total: 0,
      percentage: 0,
    });
  });
});

describe('mergeEpisodeProgress', () => {
  it('returns default unplayed state when no local progress exists', () => {
    const episode = makeEpisode();
    const merged = mergeEpisodeProgress(episode, {});

    expect(merged).not.toBe(episode);
    expect(merged).toMatchObject({
      listened: false,
      lastPositionSeconds: 0,
    });
  });

  it('ignores stale server state when no local progress exists', () => {
    const episode = makeEpisode({
      listened: true,
      lastPositionSeconds: 45,
    });

    expect(mergeEpisodeProgress(episode, {})).toMatchObject({
      listened: false,
      lastPositionSeconds: 0,
    });
  });

  it('marks listened when local progress is listened', () => {
    const episode = makeEpisode({ listened: false });
    const progress: PodcastProgressMap = {
      'loc-zh-1': { listened: true, lastPositionSeconds: 0 },
    };
    expect(mergeEpisodeProgress(episode, progress).listened).toBe(true);
  });

  it('uses local unlistened state instead of server state', () => {
    const episode = makeEpisode({ listened: true });
    const progress: PodcastProgressMap = {
      'loc-zh-1': { listened: false, lastPositionSeconds: 30 },
    };
    expect(mergeEpisodeProgress(episode, progress).listened).toBe(false);
  });

  it('overlays a local resume position when present', () => {
    const episode = makeEpisode({ lastPositionSeconds: 0 });
    const progress: PodcastProgressMap = {
      'loc-zh-1': { listened: false, lastPositionSeconds: 42 },
    };
    expect(mergeEpisodeProgress(episode, progress).lastPositionSeconds).toBe(
      42,
    );
  });

  it('uses a local zero position instead of server state', () => {
    const episode = makeEpisode({ lastPositionSeconds: 15 });
    const progress: PodcastProgressMap = {
      'loc-zh-1': { listened: false, lastPositionSeconds: 0 },
    };
    expect(mergeEpisodeProgress(episode, progress).lastPositionSeconds).toBe(0);
  });

  it('keys progress per localization so languages stay independent', () => {
    const zh = makeEpisode({
      localizationId: 'loc-zh-1',
      languageCode: 'zh-Hant',
    });
    const ja = makeEpisode({
      id: 'article-1',
      localizationId: 'loc-ja-1',
      languageCode: 'ja',
    });
    const progress: PodcastProgressMap = {
      'loc-zh-1': { listened: true, lastPositionSeconds: 0 },
    };
    expect(mergeEpisodeProgress(zh, progress).listened).toBe(true);
    expect(mergeEpisodeProgress(ja, progress).listened).toBe(false);
  });

  it('merges legacy entries without a section and section-tagged entries alike', () => {
    const episode = makeEpisode({ lastPositionSeconds: 0 });
    // Legacy entry (written before sectioned playback) has no section field.
    const legacy: PodcastProgressMap = {
      'loc-zh-1': { listened: false, lastPositionSeconds: 42 },
    };
    expect(mergeEpisodeProgress(episode, legacy).lastPositionSeconds).toBe(42);

    // A classroom-section position merges the same way; the section lives on the
    // stored entry and is read directly by the tracker, not via the episode.
    const classroom: PodcastProgressMap = {
      'loc-zh-1': {
        listened: false,
        lastPositionSeconds: 30,
        lastPositionSection: 'classroom',
      },
    };
    expect(mergeEpisodeProgress(episode, classroom).lastPositionSeconds).toBe(
      30,
    );
  });
});
