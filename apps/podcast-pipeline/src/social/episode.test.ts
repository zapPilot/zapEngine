import { describe, expect, it } from 'vitest';

import { buildSocialEpisode } from './episode.js';

describe('buildSocialEpisode', () => {
  const episode = {
    id: 'episode-1',
    source_url: 'https://example.com/article',
    source_title: 'Source title',
    created_at: '2026-08-11T00:00:00.000Z',
  };
  const localization = {
    id: 'localization-1',
    episode_id: 'episode-1',
    language_code: 'zh-Hant',
    title: '真正的標題',
    raw_text: '來源文章內容',
    script: '完整 podcast 講稿',
    status: 'completed',
  };

  it('maps a completed canonical episode and video', () => {
    const result = buildSocialEpisode({
      episode,
      localization,
      video: { status: 'completed', mp4_url: 'https://cdn.example/video.mp4' },
    });

    expect(result).toMatchObject({
      id: 'episode-1',
      title: '真正的標題',
      description: '來源文章內容',
      transcript: '完整 podcast 講稿',
      videos: { zh: 'https://cdn.example/video.mp4' },
    });
    expect(result.episodeUrl).toContain('/e/episode-1?lang=zh-Hant');
  });

  it('fails closed when the zh video is not completed', () => {
    expect(() =>
      buildSocialEpisode({
        episode,
        localization,
        video: { status: 'processing', mp4_url: 'https://cdn.example/video.mp4' },
      }),
    ).toThrow('No completed zh video found for episode episode-1');
  });

  it('fails when the transcript is empty', () => {
    expect(() =>
      buildSocialEpisode({
        episode,
        localization: { ...localization, script: ' ' },
        video: { status: 'completed', mp4_url: 'https://cdn.example/video.mp4' },
      }),
    ).toThrow('has no completed zh transcript');
  });
});
