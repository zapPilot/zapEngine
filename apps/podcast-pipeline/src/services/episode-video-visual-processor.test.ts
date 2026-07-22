import { describe, expect, it, vi } from 'vitest';

import {
  createEpisodeVideoVisualProcessor,
  VISUAL_ARTICLE_SCRAPE_TIMEOUT_MS,
} from './episode-video-visual-processor.js';
import {
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoVisualJobRow,
  type EpisodeVideoVisualSource,
  hashEpisodeVideoVisualSource,
  type ProcessEpisodeVideoVisualJobContext,
} from './video-jobs.js';

const episodeId = '00000000-0000-4000-8000-000000000001';
const localizationId = '00000000-0000-4000-8000-000000000002';

describe('createEpisodeVideoVisualProcessor', () => {
  it('creates one shared image-only checkpoint and mirrors assets to R2', async () => {
    const calls: string[] = [];
    const writeManifest = vi.fn().mockImplementation(async () => {
      calls.push('manifest');
    });
    const upload = vi.fn().mockImplementation(async () => {
      calls.push('upload');
      return {
        manifestUrl:
          'https://cdn.example.test/episodes/e/visuals/v/hash/visual-manifest.json',
        imageUrls: {
          'image-01': 'https://cdn.example.test/visuals/image-01.jpg',
          'image-02': 'https://cdn.example.test/visuals/image-02.webp',
        },
        r2Prefix: 'episodes/e/visuals/v/hash',
      };
    });
    const removeDirectory = vi.fn().mockResolvedValue(undefined);
    const logger = { info: vi.fn() };
    const scrape = vi.fn().mockResolvedValue({
      title: 'Source article',
      text: 'source text',
      images: [articleCandidate()],
    });
    const generateStoryboard = vi.fn().mockResolvedValue(storyboard());
    const processor = createEpisodeVideoVisualProcessor({
      analyzeAudio: vi.fn().mockResolvedValue({
        durationMs: 90_000,
        silences: [],
      }),
      generateStoryboard,
      scrape,
      planAssets: vi.fn().mockResolvedValue(assetPlan()),
      upload,
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work/visual'),
      writeManifest,
      removeDirectory,
      logger,
    });

    const result = await processor(job(), source(), context());

    expect(calls).toEqual(['manifest', 'upload']);
    expect(scrape).toHaveBeenCalledWith(source().sourceUrl, {
      signal: expect.any(AbortSignal),
      timeoutMs: VISUAL_ARTICLE_SCRAPE_TIMEOUT_MS,
    });
    expect(generateStoryboard).toHaveBeenCalledWith({
      title: source().title,
      script: source().script,
      searchTitle: source().englishTitle,
      searchScript: source().englishScript,
      durationMs: 90_000,
      signal: expect.any(AbortSignal),
    });
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        episodeId,
        visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
        images: [
          expect.objectContaining({
            sceneId: 'image-01',
            contentType: 'image/jpeg',
          }),
          expect.objectContaining({
            sceneId: 'image-02',
            contentType: 'image/webp',
          }),
        ],
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
        sourceHash: job().source_hash,
        r2Prefix: 'episodes/e/visuals/v/hash',
        visualPayload: expect.objectContaining({
          episodeId,
          canonicalLocalizationId: localizationId,
          visualPlan: expect.objectContaining({
            scenes: expect.arrayContaining([
              expect.objectContaining({
                sceneId: 'scene-01',
                asset: expect.objectContaining({ kind: 'remoteImage' }),
              }),
            ]),
          }),
        }),
      }),
    );
    expect(JSON.stringify(result.visualPayload)).not.toContain(source().script);
    expect(JSON.stringify(result.visualPayload)).not.toContain(
      source().englishScript,
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'visual:assets run=run12345 episode=00000000-0000-4000-8000-000000000001',
      ),
    );
    expect(removeDirectory).toHaveBeenCalledWith('/work/visual', {
      recursive: true,
      force: true,
    });
  });

  it('rejects a stale source hash without scraping or searching', async () => {
    const scrape = vi.fn();
    const processor = createEpisodeVideoVisualProcessor({ scrape });
    const staleJob = { ...job(), source_hash: 'f'.repeat(64) };

    await expect(processor(staleJob, source(), context())).rejects.toThrow(
      'source changed',
    );
    expect(scrape).not.toHaveBeenCalled();
  });

  it('cleans up its temporary images after an R2 upload failure', async () => {
    const removeDirectory = vi.fn().mockResolvedValue(undefined);
    const processor = createEpisodeVideoVisualProcessor({
      analyzeAudio: vi.fn().mockResolvedValue({
        durationMs: 90_000,
        silences: [],
      }),
      generateStoryboard: vi.fn().mockResolvedValue(storyboard()),
      scrape: vi.fn().mockResolvedValue({
        title: 'Source article',
        text: 'source text',
        images: [articleCandidate()],
      }),
      planAssets: vi.fn().mockResolvedValue(assetPlan()),
      upload: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work/visual'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory,
    });

    await expect(processor(job(), source(), context())).rejects.toThrow(
      'R2 unavailable',
    );
    expect(removeDirectory).toHaveBeenCalled();
  });
});

function source(): EpisodeVideoVisualSource {
  return {
    episodeId,
    canonicalLocalizationId: localizationId,
    title: 'Podcast title',
    script: '第一句。第二句。',
    englishTitle: 'Podcast title in English',
    englishScript: 'First sentence. Second sentence.',
    hlsUrl:
      'https://cdn.example.test/episodes/e/localizations/zh-Hant/main/playlist.m3u8',
    sourceUrl: 'https://publisher.example.test/article',
    sourceTitle: 'Source article',
  };
}

function job(): EpisodeVideoVisualJobRow {
  return {
    episode_id: episodeId,
    status: 'processing',
    visual_payload: null,
    visual_hash: null,
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    source_hash: hashEpisodeVideoVisualSource(
      source().script,
      source().englishScript,
    ),
    r2_prefix: null,
    telegram_chat_id: null,
    attempt_count: 1,
    next_attempt_at: '2026-07-20T00:00:00.000Z',
    lease_owner: 'worker-1',
    lease_expires_at: '2026-07-20T00:10:00.000Z',
    last_error: null,
    started_at: '2026-07-20T00:00:00.000Z',
    completed_at: null,
    created_at: '2026-07-20T00:00:00.000Z',
    updated_at: '2026-07-20T00:00:00.000Z',
  };
}

function context(): ProcessEpisodeVideoVisualJobContext {
  return {
    signal: new AbortController().signal,
    runId: 'run12345',
  };
}

function storyboard() {
  return {
    draft: {
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: ['first subject'],
        },
        {
          sceneId: 'scene-02',
          startSentenceId: 's0002',
          endSentenceId: 's0002',
          imageSearchIntent: ['second subject'],
        },
      ],
    },
    effectiveProvider: 'deterministic',
    requestedProvider: 'deterministic',
    model: 'deterministic-v1',
    usedFallback: false,
    attempts: [],
    totalUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
}

function assetPlan() {
  return {
    scenes: [
      { sceneId: 'scene-01', assetId: 'image-01' },
      { sceneId: 'scene-02', assetId: 'image-02' },
    ],
    assets: [
      {
        assetId: 'image-01',
        path: '/work/image-01',
        contentType: 'image/jpeg',
        sha256: 'a'.repeat(64),
        perceptualHash: '0'.repeat(16),
        width: 2400,
        height: 1350,
        originalImageUrl: 'https://images.example.test/a.jpg',
        sourcePageUrl: 'https://publisher.example.test/a',
        provider: 'article',
        license: 'unknown',
      },
      {
        assetId: 'image-02',
        path: '/work/image-02',
        contentType: 'image/webp',
        sha256: 'b'.repeat(64),
        perceptualHash: 'f'.repeat(16),
        width: 2400,
        height: 1350,
        originalImageUrl: 'https://images.example.test/b.webp',
        sourcePageUrl: 'https://publisher.example.test/b',
        provider: 'bing',
        license: 'unknown',
      },
    ],
  };
}

function articleCandidate() {
  return {
    imageUrl: 'https://images.example.test/a.jpg',
    sourceUrl: 'https://publisher.example.test/article',
    origin: 'article' as const,
    width: 2400,
    height: 1350,
  };
}
