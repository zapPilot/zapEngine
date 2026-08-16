import { describe, expect, it, vi } from 'vitest';

import {
  createEpisodeVideoProcessor,
  EPISODE_VIDEO_RENDER_TIMEOUT_CAP_MS,
  EPISODE_VIDEO_RENDER_TIMEOUT_FLOOR_MS,
  renderTimeoutMsFor,
} from './episode-video-processor.js';
import {
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoJobRow,
  type EpisodeVideoSource,
} from './video-jobs.js';

const episodeId = '00000000-0000-4000-8000-000000000001';
const localizationId = '00000000-0000-4000-8000-000000000002';
const visualHash = 'a'.repeat(64);

describe('renderTimeoutMsFor', () => {
  it('clamps short episodes to the 40 minute floor', () => {
    expect(renderTimeoutMsFor(92_800)).toBe(
      EPISODE_VIDEO_RENDER_TIMEOUT_FLOOR_MS,
    );
  });

  it('allows four times the clip duration between the limits', () => {
    expect(renderTimeoutMsFor(1_000_000)).toBe(4_000_000);
  });

  it('clamps long episodes to the 90 minute cap', () => {
    expect(renderTimeoutMsFor(2_000_000)).toBe(
      EPISODE_VIDEO_RENDER_TIMEOUT_CAP_MS,
    );
  });
});

describe('createEpisodeVideoProcessor', () => {
  function renderedArtifacts(manifestHash: string) {
    return {
      previewPath: '/work/preview.mp4',
      thumbnailPath: '/work/thumbnail.png',
      storyboardPath: '/work/storyboard.json',
      subtitlePath: '/work/captions.ass',
      sourcesPath: '/work/sources.md',
      manifestHash,
      slideMasterPaths: [],
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
      slideUrls: [],
    };
  }

  it('persists provenance before rendering and uploads immutable artifacts', async () => {
    const calls: string[] = [];
    const signal = new AbortController().signal;
    const saveManifest = vi.fn().mockImplementation(async () => {
      calls.push('save');
    });
    const downloadNarration = vi.fn().mockResolvedValue(undefined);
    const analyzeAudio = vi.fn().mockResolvedValue({
      durationMs: 90_000,
      silences: [{ startMs: 1_000, endMs: 1_200 }],
    });
    const createManifest = vi
      .fn()
      .mockResolvedValue(generatedManifest('manifest-hash'));
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
        mediaMs: 1_100,
        chunkEncodeMs: 2_200,
        finalEncodeMs: 3_300,
        downscaleMs: 400,
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
      downloadNarration,
      analyzeAudio,
      createManifest,
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
      reportProgress: vi.fn(),
    });

    expect(calls).toEqual(['save', 'render', 'upload']);
    expect(saveManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        manifestHash: 'manifest-hash',
        storyboardProvider: 'deterministic',
        storyboardPromptVersion: 'semantic-scene-alignment-v1',
      }),
    );
    expect(downloadNarration).toHaveBeenCalledWith(
      source().hlsUrl,
      '/work/narration.m4a',
      { signal: expect.any(AbortSignal) },
    );
    expect(analyzeAudio).toHaveBeenCalledWith('/work/narration.m4a', {
      signal,
    });
    expect(createManifest).toHaveBeenCalledWith(
      expect.objectContaining({ hlsUrl: source().hlsUrl }),
    );
    // The render runs on a signal derived from the job's, so it can also be cut
    // short by its own deadline; the upload keeps the job signal.
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        audioSource: '/work/narration.m4a',
      }),
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
      durationSeconds: 92.8,
    });
    expect(removeDirectory).toHaveBeenCalledWith('/work', {
      recursive: true,
      force: true,
    });
  });

  it('reports weighted progress across every render stage', async () => {
    const reportProgress = vi.fn();
    const logger = { info: vi.fn() };
    const render = vi.fn().mockImplementation(async (options) => {
      options.onProgress?.({
        message: 'Preparing media 1/3: scene-01',
        phase: 'media',
        sceneId: 'scene-01',
        sceneIndex: 1,
        sceneCount: 3,
      });
      options.onProgress?.({
        message: 'Rendering brand frame and outro card',
        phase: 'frame',
      });
      options.onProgress?.({
        message: 'Encoding vertical news video 50%',
        phase: 'encode',
        encodeFraction: 0.5,
      });
      return renderedArtifacts('manifest-hash');
    });
    const processJob = createEpisodeVideoProcessor({
      downloadNarration: vi.fn().mockResolvedValue(undefined),
      analyzeAudio: vi
        .fn()
        .mockResolvedValue({ durationMs: 90_000, silences: [] }),
      createManifest: vi
        .fn()
        .mockResolvedValue(generatedManifest('manifest-hash')),
      render,
      upload: vi.fn().mockResolvedValue(uploadedArtifacts()),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
      logger,
    });

    await processJob(job(), source(), {
      signal: new AbortController().signal,
      runId: 'run12345',
      saveManifest: vi.fn().mockResolvedValue(undefined),
      reportProgress,
    });

    expect(reportProgress.mock.calls.map(([update]) => update)).toEqual([
      { percent: 0, stage: 'analyzing-audio' },
      { percent: 5, stage: 'analyzing-audio' },
      { percent: 15, stage: 'aligning-script' },
      // preparing-media spans 15..35, so scene 1 of 3 lands a third of the way.
      { percent: 22, stage: 'preparing-media' },
      { percent: 35, stage: 'preparing-media' },
      // encoding spans 35..92.
      { percent: 64, stage: 'encoding' },
      { percent: 92, stage: 'uploading-video' },
    ]);
  });

  it('logs the scene fraction of a vertical render instead of calling it encoding', async () => {
    // The previous log helper regex only matched the retired landscape message
    // ("Rendering slide i/n"), so every vertical render logged phase=encoding
    // with no scene and no fraction at all.
    const logger = { info: vi.fn() };
    const render = vi.fn().mockImplementation(async (options) => {
      options.onProgress?.({
        message: 'Preparing media 1/3: scene-01',
        phase: 'media',
        sceneId: 'scene-01',
        sceneIndex: 1,
        sceneCount: 3,
      });
      options.onProgress?.({
        message: 'Encoding vertical news video 42%',
        phase: 'encode',
        encodeFraction: 0.42,
      });
      return renderedArtifacts('manifest-hash');
    });
    const processJob = createEpisodeVideoProcessor({
      downloadNarration: vi.fn().mockResolvedValue(undefined),
      analyzeAudio: vi
        .fn()
        .mockResolvedValue({ durationMs: 90_000, silences: [] }),
      createManifest: vi
        .fn()
        .mockResolvedValue(generatedManifest('manifest-hash')),
      render,
      upload: vi.fn().mockResolvedValue(uploadedArtifacts()),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
      logger,
    });

    await processJob(job(), source(), {
      signal: new AbortController().signal,
      runId: 'run12345',
      saveManifest: vi.fn().mockResolvedValue(undefined),
      reportProgress: vi.fn(),
    });

    const lines = logger.info.mock.calls.map(([line]) => line as string);
    const prefix = `[video-worker] video:render run=run12345 episode=${episodeId} language=zh-Hant`;
    expect(lines).toContain(
      `${prefix} phase=media scene=scene-01 progress=1/3`,
    );
    expect(lines).toContain(`${prefix} phase=encoding percent=42`);
  });

  it('logs the highest cgroup memory observed across the render lifetime', async () => {
    const logger = { info: vi.fn() };
    const mib = 1024 * 1024;
    const readCgroupMemory = vi
      .fn()
      .mockResolvedValueOnce(100 * mib)
      .mockResolvedValueOnce(300 * mib)
      .mockResolvedValueOnce(120 * mib);
    const processJob = createEpisodeVideoProcessor({
      downloadNarration: vi.fn().mockResolvedValue(undefined),
      analyzeAudio: vi
        .fn()
        .mockResolvedValue({ durationMs: 90_000, silences: [] }),
      createManifest: vi
        .fn()
        .mockResolvedValue(generatedManifest('manifest-hash')),
      render: vi.fn().mockResolvedValue(renderedArtifacts('manifest-hash')),
      upload: vi.fn().mockResolvedValue(uploadedArtifacts()),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
      readCgroupMemory,
      memorySampleIntervalMs: 60_000,
      logger,
    });

    await processJob(job(), source(), {
      signal: new AbortController().signal,
      runId: 'run12345',
      saveManifest: vi.fn().mockResolvedValue(undefined),
      reportProgress: vi.fn(),
    });

    const metricsLine = logger.info.mock.calls
      .map(([line]) => String(line))
      .find((line) => line.includes('video:render-metrics'));
    expect(metricsLine).toContain('status=completed');
    expect(metricsLine).toContain('narrationDownloadMs=');
    expect(metricsLine).toContain('mediaMs=1100');
    expect(metricsLine).toContain('chunkEncodeMs=2200');
    expect(metricsLine).toContain('finalEncodeMs=3300');
    expect(metricsLine).toContain('downscaleMs=400');
    expect(metricsLine).toContain('cgroupCurrentMb=120');
    expect(metricsLine).toContain('cgroupPeakObservedMb=300');
    expect(metricsLine).toContain('nodeRssMb=');
  });

  it('rejects when the rendered manifest hash diverges from the persisted hash', async () => {
    const processJob = createEpisodeVideoProcessor({
      downloadNarration: vi.fn().mockResolvedValue(undefined),
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
        mediaMs: 1_100,
        chunkEncodeMs: 2_200,
        finalEncodeMs: 3_300,
        downscaleMs: 400,
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
        reportProgress: vi.fn(),
      }),
    ).rejects.toThrow('Rendered manifest hash differs from persisted hash');
  });

  it('fails a wedged render on its own deadline while still relaying job aborts', async () => {
    vi.useFakeTimers();
    try {
      const renderSignals: AbortSignal[] = [];
      const render = vi.fn((options: { signal: AbortSignal }) => {
        renderSignals.push(options.signal);
        return new Promise<never>((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(abortReason(options.signal)),
            { once: true },
          );
        });
      });
      const processJob = createEpisodeVideoProcessor({
        downloadNarration: vi.fn().mockResolvedValue(undefined),
        analyzeAudio: vi
          .fn()
          .mockResolvedValue({ durationMs: 90_000, silences: [] }),
        createManifest: vi.fn().mockResolvedValue(generatedManifest('hash')),
        render: render as never,
        upload: vi.fn(),
        makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
        writeManifest: vi.fn().mockResolvedValue(undefined),
        removeDirectory: vi.fn().mockResolvedValue(undefined),
      });
      const controller = new AbortController();

      // Attach the rejection handler before advancing, or the timer fires while
      // the promise is still unobserved.
      const settled = processJob(job(), source(), {
        signal: controller.signal,
        runId: 'run12345',
        saveManifest: vi.fn().mockResolvedValue(undefined),
        reportProgress: vi.fn(),
      }).catch((error: unknown) => error);

      // A hung ffmpeg keeps renewing its lease, and the render process group has
      // no health check to notice, so the deadline is the only backstop.
      await vi.advanceTimersByTimeAsync(renderTimeoutMsFor(92_800));
      await expect(settled).resolves.toMatchObject({
        message: 'Video render exceeded 40m',
      });
      expect(controller.signal.aborted).toBe(false);
      expect(renderSignals[0]).not.toBe(controller.signal);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails a stalled narration download after five minutes and cleans up', async () => {
    vi.useFakeTimers();
    try {
      const removeDirectory = vi.fn().mockResolvedValue(undefined);
      const analyzeAudio = vi.fn();
      const downloadNarration = vi.fn(
        (
          _audioSource: string,
          _outputPath: string,
          options?: { signal?: AbortSignal },
        ) => {
          const signal = options?.signal;
          if (!signal) throw new Error('Expected download deadline signal');
          return new Promise<never>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(abortReason(signal)),
              { once: true },
            );
          });
        },
      );
      const processJob = createEpisodeVideoProcessor({
        downloadNarration,
        analyzeAudio,
        makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
        removeDirectory,
      });

      const settled = processJob(job(), source(), {
        signal: new AbortController().signal,
        runId: 'run12345',
        saveManifest: vi.fn(),
        reportProgress: vi.fn(),
      }).catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(300_000);
      await expect(settled).resolves.toMatchObject({
        message: 'Narration download exceeded 5m',
      });
      expect(analyzeAudio).not.toHaveBeenCalled();
      expect(removeDirectory).toHaveBeenCalledWith('/work', {
        recursive: true,
        force: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('cleans up the downloaded narration when audio analysis fails', async () => {
    const removeDirectory = vi.fn().mockResolvedValue(undefined);
    const createManifest = vi.fn();
    const render = vi.fn();
    const processJob = createEpisodeVideoProcessor({
      downloadNarration: vi.fn().mockResolvedValue(undefined),
      analyzeAudio: vi.fn().mockRejectedValue(new Error('ffprobe failed')),
      createManifest,
      render,
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      removeDirectory,
    });

    await expect(
      processJob(job(), source(), {
        signal: new AbortController().signal,
        runId: 'run12345',
        saveManifest: vi.fn(),
        reportProgress: vi.fn(),
      }),
    ).rejects.toThrow('ffprobe failed');

    expect(createManifest).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(removeDirectory).toHaveBeenCalledWith('/work', {
      recursive: true,
      force: true,
    });
  });

  it('stops the memory sampler when the job aborts during initialization', async () => {
    let resolveInitialMemory: ((value: number) => void) | undefined;
    const readCgroupMemory = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            resolveInitialMemory = resolve;
          }),
      )
      .mockResolvedValue(100);
    const render = vi.fn();
    const processJob = createEpisodeVideoProcessor({
      downloadNarration: vi.fn().mockResolvedValue(undefined),
      analyzeAudio: vi
        .fn()
        .mockResolvedValue({ durationMs: 90_000, silences: [] }),
      createManifest: vi.fn().mockResolvedValue(generatedManifest('hash')),
      render,
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
      readCgroupMemory,
    });
    const controller = new AbortController();
    const settled = processJob(job(), source(), {
      signal: controller.signal,
      runId: 'run12345',
      saveManifest: vi.fn().mockResolvedValue(undefined),
      reportProgress: vi.fn(),
    });

    await vi.waitFor(() => expect(readCgroupMemory).toHaveBeenCalledOnce());
    controller.abort(new Error('job cancelled'));
    if (!resolveInitialMemory) throw new Error('Memory sampler did not start');
    resolveInitialMemory(100);

    await expect(settled).rejects.toThrow('job cancelled');
    expect(render).not.toHaveBeenCalled();
    // Initial sample + stop's final sample + the metrics current sample.
    expect(readCgroupMemory).toHaveBeenCalledTimes(3);
  });

  it('rejects a localization job that no longer matches its visual checkpoint', async () => {
    const processJob = createEpisodeVideoProcessor();
    await expect(
      processJob({ ...job(), visual_hash: 'b'.repeat(64) }, source(), {
        signal: new AbortController().signal,
        runId: 'run12345',
        saveManifest: vi.fn(),
        reportProgress: vi.fn(),
      }),
    ).rejects.toThrow('does not match its completed visual checkpoint');
  });

  it('fails closed when the renderer returns no artifacts', async () => {
    const processJob = createEpisodeVideoProcessor({
      downloadNarration: vi.fn().mockResolvedValue(undefined),
      analyzeAudio: vi
        .fn()
        .mockResolvedValue({ durationMs: 90_000, silences: [] }),
      createManifest: vi
        .fn()
        .mockResolvedValue(generatedManifest('manifest-hash')),
      render: vi.fn().mockResolvedValue(null),
      upload: vi.fn(),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
      readCgroupMemory: vi.fn().mockResolvedValue(null),
    });

    await expect(
      processJob(job(), source(), {
        signal: new AbortController().signal,
        runId: 'run12345',
        saveManifest: vi.fn().mockResolvedValue(undefined),
        reportProgress: vi.fn(),
      }),
    ).rejects.toThrow('Video renderer returned no artifacts');
  });

  it('uses zero progress defaults and ignores a missing follow-up memory sample', async () => {
    const reportProgress = vi.fn();
    const readCgroupMemory = vi
      .fn()
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const render = vi.fn().mockImplementation(async (options) => {
      options.onProgress?.({ message: 'encoding', phase: 'encode' });
      options.onProgress?.({ message: 'media', phase: 'media' });
      return renderedArtifacts('manifest-hash');
    });
    const processJob = createEpisodeVideoProcessor({
      downloadNarration: vi.fn().mockResolvedValue(undefined),
      analyzeAudio: vi
        .fn()
        .mockResolvedValue({ durationMs: 90_000, silences: [] }),
      createManifest: vi
        .fn()
        .mockResolvedValue(generatedManifest('manifest-hash')),
      render,
      upload: vi.fn().mockResolvedValue(uploadedArtifacts()),
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
      readCgroupMemory,
      memorySampleIntervalMs: 60_000,
    });

    await processJob(job(), source(), {
      signal: new AbortController().signal,
      runId: 'run12345',
      saveManifest: vi.fn().mockResolvedValue(undefined),
      reportProgress,
    });

    expect(reportProgress).toHaveBeenCalledWith({
      percent: 35,
      stage: 'encoding',
    });
    expect(reportProgress).toHaveBeenCalledWith({
      percent: 15,
      stage: 'preparing-media',
    });
  });

  it('still logs metrics when memory sampler initialization fails', async () => {
    const readCgroupMemory = vi
      .fn()
      .mockRejectedValueOnce(new Error('cgroup read failed'))
      .mockResolvedValueOnce(null);
    const render = vi.fn();
    const processJob = createEpisodeVideoProcessor({
      downloadNarration: vi.fn().mockResolvedValue(undefined),
      analyzeAudio: vi
        .fn()
        .mockResolvedValue({ durationMs: 90_000, silences: [] }),
      createManifest: vi
        .fn()
        .mockResolvedValue(generatedManifest('manifest-hash')),
      render,
      makeTemporaryDirectory: vi.fn().mockResolvedValue('/work'),
      writeManifest: vi.fn().mockResolvedValue(undefined),
      removeDirectory: vi.fn().mockResolvedValue(undefined),
      readCgroupMemory,
    });

    await expect(
      processJob(job(), source(), {
        signal: new AbortController().signal,
        runId: 'run12345',
        saveManifest: vi.fn().mockResolvedValue(undefined),
        reportProgress: vi.fn(),
      }),
    ).rejects.toThrow('cgroup read failed');
    expect(render).not.toHaveBeenCalled();
  });

  it('cleans up the render directory after upload failure', async () => {
    const removeDirectory = vi.fn().mockResolvedValue(undefined);
    const processJob = createEpisodeVideoProcessor({
      downloadNarration: vi.fn().mockResolvedValue(undefined),
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
        mediaMs: 1_100,
        chunkEncodeMs: 2_200,
        finalEncodeMs: 3_300,
        downscaleMs: 400,
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
        reportProgress: vi.fn(),
      }),
    ).rejects.toThrow('R2 unavailable');
    expect(removeDirectory).toHaveBeenCalled();
  });
});

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error(String(reason));
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
      searchIntentModel: 'openrouter/free',
    },
  };
}
