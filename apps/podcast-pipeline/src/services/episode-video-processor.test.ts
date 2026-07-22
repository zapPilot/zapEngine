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

describe('createEpisodeVideoProcessor', () => {
  it('persists provenance before rendering and uploads immutable artifacts', async () => {
    const calls: string[] = [];
    const signal = new AbortController().signal;
    const saveManifest = vi.fn().mockImplementation(async () => {
      calls.push('save');
    });
    const render = vi.fn().mockImplementation(async () => {
      calls.push('render');
      return {
        previewPath: '/work/preview.mp4',
        thumbnailPath: '/work/thumbnail.png',
        storyboardPath: '/work/storyboard.json',
        subtitlePath: '/work/captions.ass',
        sourcesPath: '/work/sources.md',
        manifestHash: 'manifest-hash',
        slideMasterPaths: [],
        slideOutputPaths: ['/work/slides/slide-01.png'],
      };
    });
    const upload = vi.fn().mockImplementation(async () => {
      calls.push('upload');
      return {
        mp4Url: 'https://cdn.example.com/video.mp4',
        thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
        manifestUrl: 'https://cdn.example.com/manifest.json',
        captionsAssUrl: 'https://cdn.example.com/captions.ass',
        r2Prefix: 'episodes/episode-1/video/renderer-v1/manifest-hash',
        slideUrls: [],
      };
    });
    const removeDirectory = vi.fn().mockResolvedValue(undefined);
    const processJob = createEpisodeVideoProcessor({
      analyzeAudio: vi.fn().mockResolvedValue({
        durationMs: 90_000,
        silences: [{ startMs: 1_000, endMs: 1_200 }],
      }),
      createManifest: vi
        .fn()
        .mockResolvedValue(generatedManifest('manifest-hash')),
      render,
      upload,
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory,
    });

    const result = await processJob(job(), source(), {
      signal,
      runId: 'run12345',
      saveManifest,
    });

    expect(calls).toEqual(['save', 'render', 'upload']);
    expect(saveManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        manifestHash: 'manifest-hash',
        storyboardProvider: 'deterministic',
        storyboardPromptVersion: 'semantic-scene-alignment-v1',
      }),
    );
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ signal, audioSource: source().hlsUrl }),
    );
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        manifestHash: 'manifest-hash',
        videoPath: '/work/preview.mp4',
        slidePaths: ['/work/slides/slide-01.png'],
        signal,
      }),
    );
    expect(result).toEqual({
      mp4Url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/thumbnail.png',
      manifestUrl: 'https://cdn.example.com/manifest.json',
      captionsAssUrl: 'https://cdn.example.com/captions.ass',
      r2Prefix: 'episodes/episode-1/video/renderer-v1/manifest-hash',
      durationSeconds: 90,
    });
    expect(removeDirectory).toHaveBeenCalledWith('/work', {
      recursive: true,
      force: true,
    });
  });

  it('rejects when the rendered manifest hash diverges from the persisted hash', async () => {
    const processJob = createEpisodeVideoProcessor({
      analyzeAudio: vi.fn().mockResolvedValue({
        durationMs: 60_000,
        silences: [],
      }),
      createManifest: vi
        .fn()
        .mockResolvedValue(generatedManifest('persisted-hash')),
      render: vi.fn().mockResolvedValue({
        previewPath: '/work/preview.mp4',
        thumbnailPath: '/work/thumbnail.png',
        storyboardPath: '/work/storyboard.json',
        subtitlePath: '/work/captions.ass',
        sourcesPath: '/work/sources.md',
        manifestHash: 'rendered-hash-differs',
        slideMasterPaths: [],
        slideOutputPaths: [],
      }),
      upload: vi.fn(),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
    });

    await expect(
      processJob(job(), source(), {
        signal: new AbortController().signal,
        runId: 'run12345',
        saveManifest: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow('Rendered manifest hash differs from persisted hash');
  });

  it('cleans up the render directory after upload failure', async () => {
    const removeDirectory = vi.fn().mockResolvedValue(undefined);
    const processJob = createEpisodeVideoProcessor({
      analyzeAudio: vi.fn().mockResolvedValue({
        durationMs: 90_000,
        silences: [],
      }),
      createManifest: vi.fn().mockResolvedValue(generatedManifest('hash')),
      render: vi.fn().mockResolvedValue({
        previewPath: '/work/preview.mp4',
        thumbnailPath: '/work/thumbnail.png',
        storyboardPath: '/work/storyboard.json',
        subtitlePath: '/work/captions.ass',
        sourcesPath: '/work/sources.md',
        manifestHash: 'hash',
        slideMasterPaths: [],
        slideOutputPaths: [],
      }),
      upload: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory,
    });

    await expect(
      processJob(job(), source(), {
        signal: new AbortController().signal,
        runId: 'run12345',
        saveManifest: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow('R2 unavailable');
    expect(removeDirectory).toHaveBeenCalled();
  });
});

function source(): EpisodeVideoSource {
  return {
    episodeId,
    localizationId,
    languageCode: 'zh-Hant',
    title: 'Episode',
    script: 'Canonical script',
    hlsUrl:
      'https://cdn.example.com/episodes/episode-1/localizations/zh-Hant/main/playlist.m3u8',
    sourceUrl: 'https://example.com/article',
    sourceTitle: 'Article',
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
    next_attempt_at: '2026-07-16T00:00:00.000Z',
    lease_owner: 'worker-1',
    lease_expires_at: '2026-07-16T00:10:00.000Z',
    last_error: null,
    failure_notified_at: null,
    started_at: '2026-07-16T00:00:00.000Z',
    completed_at: null,
    created_at: '2026-07-16T00:00:00.000Z',
    updated_at: '2026-07-16T00:00:00.000Z',
  };
}

function generatedManifest(manifestHash: string) {
  return {
    manifest: {},
    manifestJson: '{"schemaVersion":"v2"}\n',
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
              url: 'https://example.com/article',
              attribution: 'Image source · example.com',
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
          },
        },
      ],
    },
    assets: [
      {
        assetId: 'image-01',
        r2Url: 'https://cdn.example.com/visuals/image-01.jpg',
        originalImageUrl: 'https://images.example.com/image-01.jpg',
        sourcePageUrl: 'https://example.com/article',
        provider: 'article',
        license: 'unknown',
        contentType: 'image/jpeg',
        sha256: 'b'.repeat(64),
        perceptualHash: '0'.repeat(16),
        width: 2400,
        height: 1350,
      },
    ],
    provenance: {
      storyboardProvider: 'deterministic',
      storyboardModel: 'deterministic-v1',
      storyboardPromptVersion: 'image-storyboard-v2',
      usedFallback: false,
    },
  };
}
