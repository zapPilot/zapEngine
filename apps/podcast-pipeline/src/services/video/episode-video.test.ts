import { describe, expect, it, vi } from 'vitest';

import {
  analyzeEpisodeAudio,
  createEpisodeVideoManifest,
} from './episode-video.js';
import type { SceneAlignmentProvider } from './scene-alignment.js';
import type { ImageVisualPlan } from './storyboard/visual-plan.js';

vi.mock('./audio-analysis.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./audio-analysis.js')>();
  return {
    ...actual,
    probeAudioDurationMs: vi.fn().mockResolvedValue(90_000),
    detectAudioSilences: vi.fn().mockResolvedValue([]),
  };
});

describe('createEpisodeVideoManifest', () => {
  it('builds a hash-addressed image-only canonical manifest', async () => {
    const script = Array.from(
      { length: 8 },
      (_, index) => `這是第${index + 1}個完整句子。`,
    ).join('');
    const result = await createEpisodeVideoManifest({
      episodeId: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      languageCode: 'zh-Hant',
      title: '市場流動性觀察',
      script,
      canonicalScript: script,
      visualPlan: visualPlan(8),
      storyboardProvider: 'deterministic',
      storyboardModel: 'deterministic-v1',
      hlsUrl:
        'https://cdn.example.com/episodes/e/localizations/zh-Hant/main/playlist.m3u8',
      durationMs: 90_000,
    });

    expect(result.manifest.schemaVersion).toBe('podcast-slide-video.v3');
    expect(result.manifest.rendererVersion).toBe('satori-resvg-v4');
    expect(result.manifest.audio.narrationDurationMs).toBe(90_000);
    expect(result.manifest.headline.kicker).toBe('鏈上快訊');
    expect(result.manifestHash).toMatch(/^[a-f\d]{64}$/);
    expect(result.scriptHash).toMatch(/^[a-f\d]{64}$/);
    expect(result.provenance).toMatchObject({
      storyboardProvider: 'deterministic',
      storyboardModel: 'deterministic-v1',
      promptVersion: 'semantic-scene-alignment-v1',
    });
    expect(
      result.manifest.slides.every((slide) => slide.template === 'image'),
    ).toBe(true);
    expect(JSON.stringify(result.manifest.slides)).not.toMatch(
      /headline|subheadline|quote|facts|excerpt/,
    );
    expect(result.manifest.audio.sourceUrl).toContain('/zh-Hant/main/');
  });

  it('uses semantic full-coverage alignment for a translated localization', async () => {
    const canonicalScript = '第一段。第二段。';
    const localizedScript = 'First sentence. Second sentence.';
    const controller = new AbortController();
    const alignmentProvider: SceneAlignmentProvider = {
      align: vi.fn().mockResolvedValue({
        scenes: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
          {
            sceneId: 'scene-02',
            startSentenceId: 's0002',
            endSentenceId: 's0002',
          },
        ],
      }),
    };

    const result = await createEpisodeVideoManifest({
      episodeId: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      languageCode: 'en',
      title: 'English episode',
      script: localizedScript,
      canonicalScript,
      visualPlan: visualPlan(2),
      storyboardProvider: 'nvidia',
      storyboardModel: 'test-model',
      hlsUrl:
        'https://cdn.example.com/episodes/e/localizations/en/main/playlist.m3u8',
      durationMs: 24_000,
      signal: controller.signal,
      alignmentProvider,
    });

    expect(alignmentProvider.align).toHaveBeenCalledOnce();
    expect(alignmentProvider.align).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
    expect(result.manifest.episode.languageCode).toBe('en');
    expect(result.manifest.audio.sourceUrl).toContain('/en/main/');
    expect(
      result.manifest.captions.map((caption) => caption.text).join(' '),
    ).toContain('First sentence');
  });

  it('uses proportional timing when semantic alignment is invalid', async () => {
    const alignmentProvider = {
      align: vi.fn().mockResolvedValue({
        scenes: [
          {
            sceneId: 'scene-01',
            startSentenceId: 's0001',
            endSentenceId: 's0001',
          },
        ],
      }),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await createEpisodeVideoManifest({
      episodeId: '9ee737b4-c3d3-4f88-9837-ccc7fc20704e',
      localizationId: '56b21422-1a38-4917-957e-b23223c0396c',
      languageCode: 'ja',
      title: 'Japanese episode',
      script: '一文目です。二文目です。',
      canonicalScript: '第一段。第二段。',
      visualPlan: visualPlan(2),
      storyboardProvider: 'deterministic',
      storyboardModel: null,
      hlsUrl:
        'https://cdn.example.com/episodes/e/localizations/ja/main/playlist.m3u8',
      durationMs: 24_000,
      alignmentProvider,
    });

    expect(alignmentProvider.align).toHaveBeenCalledOnce();
    expect(result.manifest.slides).toHaveLength(2);
    expect(result.manifest.slides.map((slide) => slide.endMs)).toEqual([
      12_000, 24_000,
    ]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('analyzeEpisodeAudio', () => {
  it('resolves duration and silences from a valid main HLS URL', async () => {
    await expect(
      analyzeEpisodeAudio(
        'https://cdn.example.com/episodes/e/localizations/en/main/playlist.m3u8',
      ),
    ).resolves.toEqual({ durationMs: 90_000, silences: [] });
  });

  it('rejects classroom audio sources', async () => {
    await expect(
      analyzeEpisodeAudio(
        'https://cdn.example.com/episodes/e/localizations/en/classroom/playlist.m3u8',
      ),
    ).rejects.toThrow('not classroom audio');
  });

  it('rejects remote audio outside the main HLS section', async () => {
    await expect(
      analyzeEpisodeAudio('https://cdn.example.com/audio.m3u8'),
    ).rejects.toThrow('must point to the main HLS section');
  });
});

function visualPlan(sceneCount: number): ImageVisualPlan {
  return {
    schemaVersion: 'podcast-image-visual-plan.v1',
    scenes: Array.from({ length: sceneCount }, (_, index) => {
      const id = String(index + 1).padStart(2, '0');
      const sentenceId = `s${String(index + 1).padStart(4, '0')}`;
      const sourceId = `image-${id}-source`;
      return {
        sceneId: `scene-${id}`,
        startSentenceId: sentenceId,
        endSentenceId: sentenceId,
        imageSearchIntent: [`visual ${id}`],
        sources: [
          {
            id: sourceId,
            label: 'publisher.example.com',
            url: 'https://publisher.example.com/article',
            attribution: 'Image source · publisher.example.com',
            license: 'unknown',
            licenseUrl: null,
          },
        ],
        asset: {
          kind: 'remoteImage',
          sourceId,
          url: `https://cdn.example.com/visuals/image-${id}.jpg`,
          sha256: index.toString(16).padStart(64, '0'),
          layout: 'fullBleed',
          position: 'center',
        },
      };
    }),
  };
}
