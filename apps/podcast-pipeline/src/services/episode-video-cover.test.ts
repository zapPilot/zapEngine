import { describe, expect, it, vi } from 'vitest';

import { createEpisodeVideoProcessor } from './episode-video-processor.js';
import {
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoJobRow,
  type EpisodeVideoSource,
} from './video-jobs.js';

const episodeId = '00000000-0000-4000-8000-000000000001';
const localizationId = '00000000-0000-4000-8000-000000000002';
const visualHash = 'a'.repeat(64);
const coverHash = 'c'.repeat(64);
const panewsSourceUrl =
  'https://www.panewslab.com/zh/articles/01a00000-0000-7000-8000-000000000000';

describe('episode video PANews cover integration', () => {
  it('returns the content-addressed PANews cover while preserving the render artifact thumbnail', async () => {
    const saveManifest = vi.fn().mockResolvedValue(undefined);
    const uploadCover = vi
      .fn()
      .mockResolvedValue('https://cdn.example.com/panews-cover.png');
    const upload = vi.fn().mockResolvedValue(uploadedArtifacts());
    const processor = createEpisodeVideoProcessor({
      downloadNarration: vi.fn().mockResolvedValue(undefined),
      analyzeAudio: vi
        .fn()
        .mockResolvedValue({ durationMs: 90_000, silences: [] }),
      createManifest: vi
        .fn()
        .mockResolvedValue(generatedManifest('manifest-hash')),
      prepareCover: vi.fn().mockResolvedValue(preparedCover()),
      uploadCover,
      render: vi.fn().mockResolvedValue(renderedArtifacts('manifest-hash')),
      upload,
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
      readCgroupMemory: vi.fn().mockResolvedValue(null),
    });

    const result = await processor(job(), source(), {
      signal: new AbortController().signal,
      runId: 'run-cover',
      saveManifest,
      reportProgress: vi.fn(),
      reportRenderMetrics: vi.fn(),
    });

    expect(uploadCover).toHaveBeenCalledWith({
      episodeId,
      visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
      sourceHash: visualHash,
      assetId: `panews-cover-${coverHash}`,
      path: '/work/panews-cover.png',
      contentType: 'image/png',
      signal: expect.any(AbortSignal),
    });
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        // Keep the renderer artifact immutable under manifestHash. The PANews
        // cover lives at its own content-addressed URL instead of overwriting it.
        thumbnailPath: '/work/thumbnail.png',
      }),
    );
    expect(result.thumbnailUrl).toBe(
      'https://cdn.example.com/panews-cover.png',
    );
    expect(saveManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({
          coverPhoto: expect.objectContaining({
            strategy: 'panews-og-image-v1',
            status: 'selected',
            sourceImageUrl: 'https://images.example.com/cover.jpg',
            storedUrl: 'https://cdn.example.com/panews-cover.png',
            sha256: coverHash,
          }),
        }),
      }),
    );
  });

  it('falls back to the renderer thumbnail when caching the PANews cover fails', async () => {
    const saveManifest = vi.fn().mockResolvedValue(undefined);
    const processor = createEpisodeVideoProcessor({
      downloadNarration: vi.fn().mockResolvedValue(undefined),
      analyzeAudio: vi
        .fn()
        .mockResolvedValue({ durationMs: 90_000, silences: [] }),
      createManifest: vi
        .fn()
        .mockResolvedValue(generatedManifest('manifest-hash')),
      prepareCover: vi.fn().mockResolvedValue(preparedCover()),
      uploadCover: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
      render: vi.fn().mockResolvedValue(renderedArtifacts('manifest-hash')),
      upload: vi.fn().mockResolvedValue(uploadedArtifacts()),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
      readCgroupMemory: vi.fn().mockResolvedValue(null),
    });

    const result = await processor(job(), source(), {
      signal: new AbortController().signal,
      runId: 'run-cover-fallback',
      saveManifest,
      reportProgress: vi.fn(),
      reportRenderMetrics: vi.fn(),
    });

    expect(result.thumbnailUrl).toBe('https://cdn.example.com/thumbnail.png');
    expect(saveManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: expect.objectContaining({
          coverPhoto: expect.objectContaining({
            status: 'fallback',
            storedUrl: null,
            fallbackReason: 'cover-cache: R2 unavailable',
          }),
        }),
      }),
    );
  });
});

function preparedCover() {
  return {
    thumbnailPath: '/work/panews-cover.png',
    metadata: {
      strategy: 'panews-og-image-v1' as const,
      status: 'selected' as const,
      sourcePageUrl: panewsSourceUrl,
      sourceImageUrl: 'https://images.example.com/cover.jpg',
      storedUrl: null,
      sha256: coverHash,
      width: 1_200,
      height: 630,
      fallbackReason: null,
    },
  };
}

function renderedArtifacts(manifestHash: string) {
  return {
    previewPath: '/work/preview.mp4',
    thumbnailPath: '/work/thumbnail.png',
    storyboardPath: '/work/storyboard.json',
    subtitlePath: '/work/captions.ass',
    sourcesPath: '/work/sources.md',
    manifestHash,
    slideOutputPaths: ['/work/slides/slide-01.png'],
    mediaMs: 1_100,
    chunkEncodeMs: 2_200,
    finalEncodeMs: 3_300,
    downscaleMs: 400,
  };
}

function uploadedArtifacts() {
  return {
    mp4Url: 'https://cdn.example.com/video.mp4',
    thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
    manifestUrl: 'https://cdn.example.com/manifest.json',
    captionsAssUrl: 'https://cdn.example.com/captions.ass',
    r2Prefix: 'episodes/episode-1/video/renderer-v1/manifest-hash',
  };
}

function source(): EpisodeVideoSource {
  return {
    episodeId,
    localizationId,
    languageCode: 'zh-Hant',
    title: 'Episode',
    script: 'Canonical script',
    hlsUrl:
      'https://cdn.example.com/episodes/episode-1/localizations/zh-Hant/main/playlist.m3u8',
    sourceUrl: panewsSourceUrl,
    sourceTitle: 'PANews article',
    canonicalLocalizationId: localizationId,
    canonicalScript: 'Canonical script',
    visualManifest: visualManifest(),
    visualHash,
    visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
    visualR2Prefix: 'episodes/e/visuals/v/hash',
  };
}

function job(): EpisodeVideoJobRow {
  return {
    episode_localization_id: localizationId,
    episode_id: episodeId,
    status: 'processing',
    progress_percent: null,
    progress_stage: null,
    visual_hash: visualHash,
    visual_version: EPISODE_VIDEO_VISUAL_VERSION,
    manifest: null,
    manifest_hash: null,
    renderer_version: null,
    storyboard_provider: null,
    storyboard_model: null,
    storyboard_prompt_version: null,
    script_hash: null,
    mp4_url: null,
    thumbnail_url: null,
    manifest_url: null,
    captions_ass_url: null,
    r2_prefix: null,
    duration_seconds: null,
    telegram_chat_id: null,
    attempt_count: 1,
    next_attempt_at: '2026-09-11T00:00:00.000Z',
    lease_owner: 'worker-1',
    lease_expires_at: '2026-09-11T00:10:00.000Z',
    last_error: null,
    failure_notified_at: null,
    started_at: '2026-09-11T00:00:00.000Z',
    completed_at: null,
    created_at: '2026-09-11T00:00:00.000Z',
    updated_at: '2026-09-11T00:00:00.000Z',
  };
}

function generatedManifest(manifestHash: string) {
  return {
    manifest: { clip: { durationMs: 92_800 } },
    manifestJson: '{"schemaVersion":"v3"}\n',
    manifestHash,
    scriptHash: 'script-hash',
    provenance: {
      storyboardProvider: 'deterministic',
      storyboardModel: 'deterministic-v1',
      promptVersion: 'semantic-scene-alignment-v1',
      rendererVersion: 'satori-resvg-v3',
    },
  };
}

function visualManifest(): Record<string, unknown> {
  return {
    schemaVersion: 'podcast-episode-visual.v1',
    visualVersion: EPISODE_VIDEO_VISUAL_VERSION,
    visualHash,
    episodeId,
    canonicalLocalizationId: localizationId,
    manifestUrl: 'https://cdn.example.com/visual-manifest.json',
    visualPlan: {
      schemaVersion: 'podcast-image-visual-plan.v1',
      scenes: [
        {
          sceneId: 'scene-01',
          startSentenceId: 's0001',
          endSentenceId: 's0001',
          imageSearchIntent: ['canonical visual'],
          sources: [
            {
              id: 'image-01-source',
              label: 'example.com',
              url: panewsSourceUrl,
              attribution: 'Image source · PANews',
              license: 'unknown',
              licenseUrl: null,
            },
          ],
          asset: {
            kind: 'remoteImage',
            sourceId: 'image-01-source',
            url: 'https://cdn.example.com/visuals/image-01.jpg',
            sha256: 'b'.repeat(64),
            layout: 'fullBleed',
            position: 'center',
            motion: 'static',
          },
        },
      ],
    },
    assets: [
      {
        assetId: 'image-01',
        r2Url: 'https://cdn.example.com/visuals/image-01.jpg',
        originalImageUrl: 'https://images.example.com/image-01.jpg',
        sourcePageUrl: panewsSourceUrl,
        provider: 'article',
        license: 'unknown',
        contentType: 'image/jpeg',
        sha256: 'b'.repeat(64),
        perceptualHash: '0'.repeat(16),
        width: 2_400,
        height: 1_350,
      },
    ],
    provenance: {
      storyboardProvider: 'deterministic',
      storyboardModel: 'deterministic-v1',
      storyboardPromptVersion: 'image-storyboard-v2',
      usedFallback: false,
      searchIntentModel: 'openrouter/free',
    },
  };
}
