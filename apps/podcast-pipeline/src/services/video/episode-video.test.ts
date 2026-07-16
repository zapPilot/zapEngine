import { describe, expect, it } from 'vitest';

import { createEpisodeVideoManifest } from './episode-video.js';
import { createDeterministicStoryboardProvider } from './storyboard/fallback.js';

describe('createEpisodeVideoManifest', () => {
  it('returns a trusted, hash-addressable, frame-aligned worker contract', async () => {
    const script = [
      '今天先看市場流動性的變化。',
      '第一個訊號來自美元資金成本。',
      '接著觀察國債市場的期限溢價。',
      '投資人也重新評估風險資產。',
      '鏈上交易量同步出現回升。',
      '穩定幣供給提供另一個線索。',
      '交易所的深度仍需要持續追蹤。',
      '短期波動不代表趨勢已經反轉。',
      '風險管理仍然是最重要的原則。',
      '最後請留意下一次政策會議。',
    ].join('');
    const result = await createEpisodeVideoManifest({
      episodeId: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      title: '市場流動性觀察',
      script,
      hlsUrl:
        'https://cdn.example.com/episodes/e/localizations/zh-Hant/main/playlist.m3u8',
      sourceUrl: 'https://news.example.com/article',
      durationMs: 90_000,
      provider: createDeterministicStoryboardProvider(),
    });

    expect(result.manifest.rendererVersion).toBe('satori-resvg-v2');
    expect(result.manifestHash).toMatch(/^[a-f\d]{64}$/);
    expect(result.scriptHash).toMatch(/^[a-f\d]{64}$/);
    expect(result.provenance).toMatchObject({
      requestedProvider: 'deterministic',
      effectiveProvider: 'deterministic',
      promptVersion: 'nvidia-storyboard-v1',
    });
    const captionBoundaries = new Set(
      result.manifest.captions.flatMap((caption) => [
        caption.startMs,
        caption.endMs,
      ]),
    );
    for (const slide of result.manifest.slides) {
      expect(captionBoundaries.has(slide.startMs)).toBe(true);
      expect(captionBoundaries.has(slide.endMs)).toBe(true);
      expect(slide.endMs - slide.startMs).toBeGreaterThanOrEqual(8_000);
      expect(slide.endMs - slide.startMs).toBeLessThanOrEqual(13_000);
    }
  });
});
