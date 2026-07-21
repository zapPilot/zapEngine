import { describe, expect, it, vi } from 'vitest';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import {
  clampPodcastPlaybackSeconds,
  createPodcastPlayerSnapshot,
  findPodcastQueueIndex,
  hasNextPodcastEpisode,
  hasPreviousPodcastEpisode,
  isSamePodcastEpisode,
} from '@/integration/podcastPlayerShared';

function makeEpisode(overrides: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return {
    id: 'article-1',
    localizationId: 'loc-zh-1',
    title: 'Episode',
    languageCode: 'zh-Hant',
    hlsUrl: 'https://example.com/audio.m3u8',
    createdAt: '2026-07-20T00:00:00.000Z',
    listened: false,
    likeCount: 0,
    script: null,
    video: null,
    audioTracks: [],
    languageClassrooms: [],
    lastPositionSeconds: 0,
    ...overrides,
  };
}

describe('podcast episode playback identity', () => {
  it('uses localizationId rather than the article id', () => {
    const current = makeEpisode();

    expect(
      isSamePodcastEpisode(
        current,
        makeEpisode({ id: 'article-2', localizationId: 'loc-zh-1' }),
      ),
    ).toBe(true);
    expect(
      isSamePodcastEpisode(
        current,
        makeEpisode({ localizationId: 'loc-ja-1' }),
      ),
    ).toBe(false);
  });

  it('finds a queue item by localizationId', () => {
    const queue = [
      makeEpisode({ localizationId: 'loc-zh-1' }),
      makeEpisode({ id: 'article-2', localizationId: 'loc-ja-1' }),
    ];
    const target = makeEpisode({
      id: 'a-stale-article-id',
      localizationId: 'loc-ja-1',
    });

    expect(findPodcastQueueIndex(queue, target)).toBe(1);
  });
});

describe('podcast queue boundaries', () => {
  const queue = [
    makeEpisode({ localizationId: 'loc-1' }),
    makeEpisode({ localizationId: 'loc-2' }),
    makeEpisode({ localizationId: 'loc-3' }),
  ];

  it('only exposes previous navigation for valid non-first items', () => {
    expect(hasPreviousPodcastEpisode(queue, -1)).toBe(false);
    expect(hasPreviousPodcastEpisode(queue, 0)).toBe(false);
    expect(hasPreviousPodcastEpisode(queue, 1)).toBe(true);
    expect(hasPreviousPodcastEpisode(queue, queue.length)).toBe(false);
  });

  it('only exposes next navigation for valid non-last items', () => {
    expect(hasNextPodcastEpisode(queue, -1)).toBe(false);
    expect(hasNextPodcastEpisode(queue, 0)).toBe(true);
    expect(hasNextPodcastEpisode(queue, queue.length - 1)).toBe(false);
    expect(hasNextPodcastEpisode(queue, queue.length)).toBe(false);
  });
});

describe('clampPodcastPlaybackSeconds', () => {
  it('clamps a finite handoff position to the media duration', () => {
    expect(clampPodcastPlaybackSeconds(90, 60)).toBe(60);
    expect(clampPodcastPlaybackSeconds(42, 60)).toBe(42);
  });

  it('normalises negative and non-finite handoff positions', () => {
    expect(clampPodcastPlaybackSeconds(-5, 60)).toBe(0);
    expect(clampPodcastPlaybackSeconds(Number.NaN, 60)).toBe(0);
    expect(clampPodcastPlaybackSeconds(Number.POSITIVE_INFINITY, 60)).toBe(0);
  });

  it('retains the finite target while duration is not known', () => {
    expect(clampPodcastPlaybackSeconds(42, 0)).toBe(42);
  });
});

describe('createPodcastPlayerSnapshot', () => {
  it('exposes the explicit queue handoff action unchanged', () => {
    const playFromQueueAt = vi.fn();
    const noop = vi.fn();
    const snapshot = createPodcastPlayerSnapshot({
      nowPlaying: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      speed: 1.5,
      queue: [],
      queueIndex: -1,
      pause: noop,
      toggle: noop,
      playFromQueue: noop,
      playFromQueueAt,
      seek: noop,
      seekRelative: noop,
      skipToPreviousEpisode: () => null,
      skipToNextEpisode: () => null,
      setSpeed: noop,
    });

    expect(snapshot.playFromQueueAt).toBe(playFromQueueAt);
  });

  it('normalises invalid playback state and derives queue navigation', () => {
    const noop = vi.fn();
    const queue = [
      makeEpisode({ localizationId: 'loc-1' }),
      makeEpisode({ localizationId: 'loc-2' }),
      makeEpisode({ localizationId: 'loc-3' }),
    ];
    const snapshot = createPodcastPlayerSnapshot({
      nowPlaying: queue[1] ?? null,
      isPlaying: true,
      currentTime: Number.NaN,
      duration: Number.POSITIVE_INFINITY,
      speed: 1,
      queue,
      queueIndex: 1,
      pause: noop,
      toggle: noop,
      playFromQueue: noop,
      playFromQueueAt: noop,
      seek: noop,
      seekRelative: noop,
      skipToPreviousEpisode: () => queue[0] ?? null,
      skipToNextEpisode: () => queue[2] ?? null,
      setSpeed: noop,
    });

    expect(snapshot.currentTime).toBe(0);
    expect(snapshot.duration).toBe(0);
    expect(snapshot.hasPreviousEpisode).toBe(true);
    expect(snapshot.hasNextEpisode).toBe(true);
  });
});
