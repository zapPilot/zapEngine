import { afterEach, describe, expect, it, vi } from 'vitest';

import { createEpisodeVideoManifest } from './episode-video.js';
import { createDeterministicStoryboardProvider } from './storyboard/fallback.js';

vi.mock('./audio-analysis.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./audio-analysis.js')>();
  return {
    ...actual,
    probeAudioDurationMs: vi.fn().mockResolvedValue(90_000),
    detectAudioSilences: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('./storyboard/nvidia.js', () => ({
  createNvidiaStoryboardProvider: vi.fn(() => ({
    name: 'nvidia',
    model: 'test-model',
    async generate() {
      throw new Error('Simulated API failure');
    },
  })),
}));

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

  it('rejects audio that does not point to the main HLS section', async () => {
    const { analyzeEpisodeAudio } = await import('./episode-video.js');
    await expect(
      analyzeEpisodeAudio('https://cdn.example.com/audio.m3u8'),
    ).rejects.toThrow('must point to the main HLS section');
  });

  it('rejects classroom audio sources', async () => {
    const { analyzeEpisodeAudio } = await import('./episode-video.js');
    await expect(
      analyzeEpisodeAudio(
        'https://cdn.example.com/episodes/e/localizations/zh-Hant/classroom/playlist.m3u8',
      ),
    ).rejects.toThrow('not classroom audio');
  });

  describe('analyzeEpisodeAudio', () => {
    it('resolves duration and silences from a valid main HLS URL', async () => {
      const { analyzeEpisodeAudio } = await import('./episode-video.js');
      const result = await analyzeEpisodeAudio(
        'https://cdn.example.com/episodes/e/localizations/zh-Hant/main/playlist.m3u8',
      );
      expect(result).toEqual({ durationMs: 90_000, silences: [] });
    });
  });

  describe('configuredProvider', () => {
    afterEach(() => {
      delete process.env['VIDEO_STORYBOARD_PROVIDER'];
    });

    it('falls back to nvidia provider when env var is set', async () => {
      process.env['VIDEO_STORYBOARD_PROVIDER'] = 'nvidia';
      const result = await createEpisodeVideoManifest({
        episodeId: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
        localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
        title: 'test',
        script: '今天先看市場流動性的變化。',
        hlsUrl:
          'https://cdn.example.com/episodes/e/localizations/zh-Hant/main/playlist.m3u8',
        sourceUrl: 'https://news.example.com/article',
        durationMs: 90_000,
      });
      expect(result.provenance.requestedProvider).toBe('nvidia');
      expect(result.provenance.usedFallback).toBe(true);
    });

    it('throws for unsupported provider name', async () => {
      process.env['VIDEO_STORYBOARD_PROVIDER'] = 'invalid';
      await expect(
        createEpisodeVideoManifest({
          episodeId: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
          localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
          title: 'test',
          script: '今天先看市場流動性的變化。',
          hlsUrl:
            'https://cdn.example.com/episodes/e/localizations/zh-Hant/main/playlist.m3u8',
          sourceUrl: 'https://news.example.com/article',
          durationMs: 90_000,
        }),
      ).rejects.toThrow('Unsupported VIDEO_STORYBOARD_PROVIDER: invalid');
    });
  });
});
