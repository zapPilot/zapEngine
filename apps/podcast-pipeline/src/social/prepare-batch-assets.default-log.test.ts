import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSocialEpisode: vi.fn(),
  requireSocialEpisodeVideoUrl: vi.fn(),
  requiresLocalVideo: vi.fn(() => false),
  requiresLocalTeaser: vi.fn(() => false),
  prepareSocialVideo: vi.fn(),
  prepareXTeaserVideo: vi.fn(),
}));

vi.mock('./episode.js', () => ({
  getSocialEpisode: mocks.getSocialEpisode,
  requireSocialEpisodeVideoUrl: mocks.requireSocialEpisodeVideoUrl,
}));
vi.mock('./platforms.js', () => ({
  requiresLocalVideo: mocks.requiresLocalVideo,
  requiresLocalTeaser: mocks.requiresLocalTeaser,
}));
vi.mock('./video.js', () => ({
  prepareSocialVideo: mocks.prepareSocialVideo,
  prepareXTeaserVideo: mocks.prepareXTeaserVideo,
  xTeaserDurationSeconds: vi.fn(),
}));

import { prepareSocialBatchAssets } from './prepare-batch-assets.js';

describe('prepareSocialBatchAssets default logger', () => {
  it('runs metadata logging through the no-op logger when none is supplied', async () => {
    const episode = {
      id: 'episode-1',
      title: 'title',
      summary: 'summary',
      transcript: 'transcript',
      publishedAt: '2026-09-01T00:00:00.000Z',
      episodeUrl: 'https://example.test/e/1',
      videoDurationSeconds: 120,
      languageCode: 'zh-Hant',
      videoUrl: 'https://example.test/video.mp4',
      videoThumbnailUrl: 'https://example.test/poster.jpg',
    };
    mocks.getSocialEpisode.mockResolvedValue(episode);

    await expect(
      prepareSocialBatchAssets({
        episodeId: 'episode-1',
        languageCode: 'zh-Hant',
        platforms: [],
      }),
    ).resolves.toEqual({ episode, video: undefined, teaserVideo: undefined });

    expect(mocks.getSocialEpisode).toHaveBeenCalledOnce();
  });
});
