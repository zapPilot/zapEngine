import { describe, expect, it } from 'vitest';

import { prepareSocialBatchAssets } from './prepare-batch-assets.js';
import type { SocialEpisode } from './types.js';

const episode: SocialEpisode = {
  id: 'episode-1',
  title: '標題',
  summary: '摘要',
  transcript: '逐字稿',
  publishedAt: '2026-08-11T00:00:00.000Z',
  episodeUrl: 'https://example.test/e/1',
  videoDurationSeconds: 120,
  languageCode: 'zh-Hant',
  videoUrl: 'https://example.test/video.mp4',
  videoThumbnailUrl: 'https://example.test/poster.jpg',
};

describe('prepare batch assets coverage', () => {
  it('reuses supplied assets without logging when no logger is given', async () => {
    // WHY: the `?? noop` fallback only runs when `onLog` is omitted.
    const video = { path: '/tmp/video.mp4', sizeBytes: 10, reused: true };
    const teaserVideo = { path: '/tmp/teaser.mp4', sizeBytes: 5, reused: true };
    const assets = await prepareSocialBatchAssets({
      episodeId: episode.id,
      languageCode: 'zh-Hant',
      platforms: ['x'],
      existing: { episode, video, teaserVideo },
    });
    expect(assets.episode).toBe(episode);
    expect(assets.video).toBe(video);
    expect(assets.teaserVideo).toBe(teaserVideo);
  });

  it('formats durations and byte sizes on both sides of the megabyte line', async () => {
    // WHY: format helpers carry branches for sub-megabyte and minute values.
    const { formatBytes, formatDuration } = await import(
      './prepare-batch-assets.js'
    );
    expect(formatDuration(65)).toBe('1m 05s');
    expect(formatDuration(30)).toBe('0m 30s');
    expect(formatBytes(512 * 1024)).toContain('KB');
    expect(formatBytes(2 * 1024 * 1024)).toContain('MB');
  });
});
