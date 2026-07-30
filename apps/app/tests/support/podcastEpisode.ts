import type { PodcastEpisode } from '@/integration/podcastFeed';

const DEFAULT_PODCAST_EPISODE: PodcastEpisode = {
  id: 'episode-1',
  localizationId: 'episode-1-zh-Hant',
  title: 'Episode',
  languageCode: 'zh-Hant',
  hlsUrl: 'https://example.com/audio.m3u8',
  createdAt: '2026-07-10T00:00:00.000Z',
  listened: false,
  likeCount: 0,
  script: null,
  video: null,
  videoGeneration: null,
  audioTracks: [],
  languageClassrooms: [],
  lastPositionSeconds: 0,
};

type PodcastEpisodeOverrides =
  | Partial<PodcastEpisode>
  | Record<string, unknown>;

export function createPodcastEpisode(
  overrides: PodcastEpisodeOverrides = {},
): PodcastEpisode {
  return {
    ...DEFAULT_PODCAST_EPISODE,
    ...overrides,
  } as PodcastEpisode;
}

export function createPodcastEpisodeFactory(
  defaults: Partial<PodcastEpisode>,
): (overrides?: PodcastEpisodeOverrides) => PodcastEpisode {
  return (overrides = {}) =>
    createPodcastEpisode({
      ...defaults,
      ...overrides,
    });
}
