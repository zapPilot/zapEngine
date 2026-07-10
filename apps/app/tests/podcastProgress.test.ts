import { describe, expect, it } from 'vitest';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import {
  mergeEpisodeProgress,
  type PodcastProgressMap,
  resolveEpisodeStatus,
} from '@/integration/podcastProgress';

function makeEpisode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return {
    id: 'article-1',
    localizationId: 'loc-zh-1',
    title: 'Episode',
    languageCode: 'zh-Hant',
    hlsUrl: 'https://example.com/a.m3u8',
    createdAt: '2026-07-10T00:00:00.000Z',
    listened: false,
    likeCount: 0,
    script: null,
    audioTracks: [],
    languageClassrooms: [],
    lastPositionSeconds: 0,
    ...overrides,
  };
}

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

describe('mergeEpisodeProgress', () => {
  it('returns the episode unchanged when no local progress exists', () => {
    const episode = makeEpisode();
    expect(mergeEpisodeProgress(episode, {})).toBe(episode);
  });

  it('marks listened when local progress is listened (server wins-or)', () => {
    const episode = makeEpisode({ listened: false });
    const progress: PodcastProgressMap = {
      'loc-zh-1': { listened: true, lastPositionSeconds: 0 },
    };
    expect(mergeEpisodeProgress(episode, progress).listened).toBe(true);
  });

  it('keeps server listened even when local is not listened', () => {
    const episode = makeEpisode({ listened: true });
    const progress: PodcastProgressMap = {
      'loc-zh-1': { listened: false, lastPositionSeconds: 30 },
    };
    expect(mergeEpisodeProgress(episode, progress).listened).toBe(true);
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

  it('keeps the server position when local position is zero', () => {
    const episode = makeEpisode({ lastPositionSeconds: 15 });
    const progress: PodcastProgressMap = {
      'loc-zh-1': { listened: false, lastPositionSeconds: 0 },
    };
    expect(mergeEpisodeProgress(episode, progress).lastPositionSeconds).toBe(
      15,
    );
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
});
