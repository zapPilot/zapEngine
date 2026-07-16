import { describe, expect, it, vi } from 'vitest';

import { createEpisodeVideoProcessor } from './episode-video-processor.js';
import type { EpisodeVideoJobRow, EpisodeVideoSource } from './video-jobs.js';

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
      createManifest: vi.fn().mockResolvedValue({
        manifest: {},
        manifestJson: '{"schemaVersion":"v1"}\n',
        manifestHash: 'manifest-hash',
        scriptHash: 'script-hash',
        provenance: {
          requestedProvider: 'nvidia',
          effectiveProvider: 'deterministic',
          model: null,
          promptVersion: 'nvidia-storyboard-v1',
          rendererVersion: 'satori-resvg-v1',
          usedFallback: true,
        },
        validation: {
          attempts: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      }),
      render,
      upload,
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory,
    });

    const result = await processJob(job(), source(), {
      signal,
      saveManifest,
    });

    expect(calls).toEqual(['save', 'render', 'upload']);
    expect(saveManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        manifestHash: 'manifest-hash',
        storyboardProvider: 'deterministic',
        storyboardPromptVersion: 'nvidia-storyboard-v1',
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

  it('cleans up the render directory after upload failure', async () => {
    const removeDirectory = vi.fn().mockResolvedValue(undefined);
    const processJob = createEpisodeVideoProcessor({
      analyzeAudio: vi.fn().mockResolvedValue({
        durationMs: 90_000,
        silences: [],
      }),
      createManifest: vi.fn().mockResolvedValue({
        manifest: {},
        manifestJson: '{}\n',
        manifestHash: 'hash',
        scriptHash: 'script-hash',
        provenance: {
          requestedProvider: 'deterministic',
          effectiveProvider: 'deterministic',
          model: 'deterministic-v1',
          promptVersion: 'nvidia-storyboard-v1',
          rendererVersion: 'satori-resvg-v1',
          usedFallback: false,
        },
        validation: {
          attempts: [],
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        },
      }),
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
        saveManifest: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow('R2 unavailable');
    expect(removeDirectory).toHaveBeenCalled();
  });
});

function source(): EpisodeVideoSource {
  return {
    episodeId: 'episode-1',
    localizationId: 'localization-1',
    languageCode: 'zh-Hant',
    title: 'Episode',
    script: 'Canonical script',
    hlsUrl:
      'https://cdn.example.com/episodes/episode-1/localizations/zh-Hant/main/playlist.m3u8',
    sourceUrl: 'https://example.com/article',
    sourceTitle: 'Article',
  };
}

function job(): EpisodeVideoJobRow {
  return {
    episode_localization_id: 'localization-1',
    status: 'processing',
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
