import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { uploadVideoArtifactsToR2 } from './storage.js';
import { combineAbortSignalWithTimeout } from './video/abort.js';
import {
  analyzeEpisodeAudio,
  createEpisodeVideoManifest,
} from './video/episode-video.js';
import { parseEpisodeVisualPayload } from './video/episode-visual.js';
import {
  type RenderProgressEvent,
  renderSlideVideo,
} from './video/renderer.js';
import {
  type EpisodeVideoProgressUpdate,
  renderStageProgress,
} from './video-progress.js';
import type { ProcessEpisodeVideoJob } from './video-worker.js';

// A wedged ffmpeg would keep renewing its lease forever, and the render process
// group has no HTTP service and therefore no Fly health check to notice. Bound
// the encode so the job fails with a legible reason instead of holding the lease.
export const EPISODE_VIDEO_RENDER_TIMEOUT_MS = 2_400_000;

/* jscpd:ignore-start -- dependency injection factory pattern, irreducible by design */

interface EpisodeVideoProcessorDependencies {
  analyzeAudio: typeof analyzeEpisodeAudio;
  createManifest: typeof createEpisodeVideoManifest;
  render: typeof renderSlideVideo;
  upload: typeof uploadVideoArtifactsToR2;
  makeTemporaryDirectory: (prefix: string) => Promise<string>;
  writeManifest: typeof writeFile;
  removeDirectory: typeof rm;
  readCgroupMemory: () => Promise<number | null>;
  memorySampleIntervalMs: number;
  logger: Pick<Console, 'info'>;
}

const defaultDependencies: EpisodeVideoProcessorDependencies = {
  analyzeAudio: analyzeEpisodeAudio,
  createManifest: createEpisodeVideoManifest,
  render: renderSlideVideo,
  upload: uploadVideoArtifactsToR2,
  makeTemporaryDirectory: mkdtemp,
  writeManifest: writeFile,
  removeDirectory: rm,
  readCgroupMemory: readCgroupCurrentBytes,
  memorySampleIntervalMs: 250,
  logger: console,
};

export function createEpisodeVideoProcessor(
  overrides: Partial<EpisodeVideoProcessorDependencies> = {},
): ProcessEpisodeVideoJob {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async (job, source, context) => {
    context.signal.throwIfAborted();
    const visual = parseEpisodeVisualPayload(source.visualManifest);
    if (
      visual.visualHash !== source.visualHash ||
      visual.visualVersion !== source.visualVersion ||
      visual.episodeId !== source.episodeId ||
      visual.canonicalLocalizationId !== source.canonicalLocalizationId ||
      (job.visual_hash !== null && job.visual_hash !== visual.visualHash) ||
      job.visual_version !== visual.visualVersion
    ) {
      throw new Error(
        'Localization video job does not match its completed visual checkpoint',
      );
    }

    context.reportProgress(renderStageProgress('analyzing-audio', 0));
    const analysis = await dependencies.analyzeAudio(source.hlsUrl, {
      signal: context.signal,
    });
    context.reportProgress(renderStageProgress('analyzing-audio'));
    const alignmentStartedAt = Date.now();
    logLocaleVideoEvent(dependencies.logger, 'video:alignment', {
      run: context.runId,
      episode: source.episodeId,
      language: source.languageCode,
      phase: 'start',
    });
    const generated = await dependencies.createManifest({
      episodeId: source.episodeId,
      localizationId: source.localizationId,
      languageCode: source.languageCode,
      title: source.title,
      script: source.script,
      canonicalScript: source.canonicalScript,
      visualPlan: visual.visualPlan,
      storyboardProvider: visual.provenance.storyboardProvider,
      storyboardModel: visual.provenance.storyboardModel,
      hlsUrl: source.hlsUrl,
      durationMs: analysis.durationMs,
      silences: analysis.silences,
      signal: context.signal,
    });
    logLocaleVideoEvent(dependencies.logger, 'video:alignment', {
      run: context.runId,
      episode: source.episodeId,
      language: source.languageCode,
      phase: 'done',
      elapsedMs: Date.now() - alignmentStartedAt,
    });
    context.reportProgress(renderStageProgress('aligning-script'));

    await context.saveManifest({
      manifest: JSON.parse(generated.manifestJson) as Record<string, unknown>,
      manifestHash: generated.manifestHash,
      rendererVersion: generated.provenance.rendererVersion,
      storyboardProvider: generated.provenance.storyboardProvider,
      storyboardModel: generated.provenance.storyboardModel,
      storyboardPromptVersion: generated.provenance.promptVersion,
      scriptHash: generated.scriptHash,
    });

    const outputDirectory = await dependencies.makeTemporaryDirectory(
      join(tmpdir(), 'episode-video-worker-'),
    );
    const manifestPath = join(outputDirectory, 'manifest-input.json');
    try {
      await dependencies.writeManifest(
        manifestPath,
        generated.manifestJson,
        'utf8',
      );
      context.signal.throwIfAborted();
      const renderDeadline = combineAbortSignalWithTimeout(
        context.signal,
        EPISODE_VIDEO_RENDER_TIMEOUT_MS,
        `Video render exceeded ${Math.round(EPISODE_VIDEO_RENDER_TIMEOUT_MS / 60_000)}m`,
      );
      const renderStartedAt = Date.now();
      const memorySampler = await startCgroupMemorySampler(
        dependencies.readCgroupMemory,
        dependencies.memorySampleIntervalMs,
      );
      renderDeadline.signal.throwIfAborted();
      let renderStatus: 'completed' | 'failed' = 'failed';
      let rendered: Awaited<ReturnType<typeof renderSlideVideo>>;
      try {
        rendered = await dependencies.render({
          manifestPath,
          outputDirectory,
          audioSource: source.hlsUrl,
          signal: renderDeadline.signal,
          onProgress: (event) => {
            logRenderProgress(
              dependencies.logger,
              context.runId,
              source.episodeId,
              source.languageCode,
              event,
            );
            context.reportProgress(renderEventProgress(event));
          },
        });
        renderStatus = 'completed';
      } finally {
        const observedPeakBytes = await memorySampler.stop();
        await logRenderMetrics(dependencies.logger, {
          run: context.runId,
          episode: source.episodeId,
          language: source.languageCode,
          status: renderStatus,
          wallMs: Date.now() - renderStartedAt,
          durationMs: generated.manifest.clip.durationMs,
          observedPeakBytes,
          currentBytes: await dependencies.readCgroupMemory(),
        });
        renderDeadline.dispose();
      }
      if (rendered.manifestHash !== generated.manifestHash) {
        throw new Error('Rendered manifest hash differs from persisted hash');
      }

      context.reportProgress(renderStageProgress('uploading-video', 0));
      const uploaded = await dependencies.upload({
        episodeId: source.episodeId,
        languageCode: source.languageCode,
        rendererVersion: generated.provenance.rendererVersion,
        manifestHash: generated.manifestHash,
        videoPath: rendered.previewPath,
        thumbnailPath: rendered.thumbnailPath,
        manifestPath: rendered.storyboardPath,
        captionsPath: rendered.subtitlePath,
        slidePaths: rendered.slideOutputPaths,
        signal: context.signal,
      });
      return {
        mp4Url: uploaded.mp4Url,
        thumbnailUrl: uploaded.thumbnailUrl,
        manifestUrl: uploaded.manifestUrl,
        captionsAssUrl: uploaded.captionsAssUrl,
        r2Prefix: uploaded.r2Prefix,
        // The MP4 outlives the narration by the BGM outro tail, so player
        // scrubbers must use the clip duration, not the audio analysis.
        durationSeconds: generated.manifest.clip.durationMs / 1_000,
      };
    } finally {
      await dependencies.removeDirectory(outputDirectory, {
        recursive: true,
        force: true,
      });
    }
  };
}

/**
 * Progress within the render half of the bar. Weights live in video-progress.ts
 * so the worker's writes and the API's composition cannot drift apart.
 */
function renderEventProgress(
  event: RenderProgressEvent,
): EpisodeVideoProgressUpdate {
  if (event.phase === 'encode') {
    return renderStageProgress('encoding', event.encodeFraction ?? 0);
  }
  if (event.phase === 'frame') return renderStageProgress('preparing-media');
  const fraction =
    event.sceneIndex !== undefined && event.sceneCount
      ? event.sceneIndex / event.sceneCount
      : 0;
  return renderStageProgress('preparing-media', fraction);
}

function logRenderProgress(
  logger: Pick<Console, 'info'>,
  runId: string,
  episodeId: string,
  languageCode: string,
  event: RenderProgressEvent,
): void {
  logLocaleVideoEvent(logger, 'video:render', {
    run: runId,
    episode: episodeId,
    language: languageCode,
    phase: event.phase === 'encode' ? 'encoding' : event.phase,
    ...(event.sceneId ? { scene: event.sceneId } : {}),
    ...(event.sceneIndex !== undefined && event.sceneCount !== undefined
      ? { progress: `${event.sceneIndex}/${event.sceneCount}` }
      : {}),
    ...(event.encodeFraction === undefined
      ? {}
      : { percent: Math.round(event.encodeFraction * 100) }),
  });
}

function logLocaleVideoEvent(
  logger: Pick<Console, 'info'>,
  event: string,
  fields: Record<string, string | number>,
): void {
  const details = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  logger.info(`[video-worker] ${event} ${details}`);
}

async function readCgroupCurrentBytes(): Promise<number | null> {
  for (const path of [
    '/sys/fs/cgroup/memory.current',
    '/sys/fs/cgroup/memory/memory.usage_in_bytes',
  ]) {
    try {
      const value = Number((await readFile(path, 'utf8')).trim());
      if (Number.isFinite(value) && value >= 0) return value;
    } catch {
      // Local development and non-Linux hosts do not expose cgroup files.
    }
  }
  return null;
}

async function startCgroupMemorySampler(
  readCurrent: () => Promise<number | null>,
  intervalMs: number,
): Promise<{ stop: () => Promise<number | null> }> {
  const first = await readCurrent();
  if (first === null) return { stop: async () => null };

  let peak = first;
  const sample = async () => {
    const current = await readCurrent();
    if (current !== null) peak = Math.max(peak, current);
  };
  const timer = setInterval(() => {
    void sample();
  }, intervalMs);
  timer.unref?.();

  return {
    stop: async () => {
      clearInterval(timer);
      await sample();
      return peak;
    },
  };
}

function bytesToMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

async function logRenderMetrics(
  logger: Pick<Console, 'info'>,
  fields: {
    run: string;
    episode: string;
    language: string;
    status: 'completed' | 'failed';
    wallMs: number;
    durationMs: number;
    observedPeakBytes: number | null;
    currentBytes: number | null;
  },
): Promise<void> {
  const { observedPeakBytes, currentBytes, ...eventFields } = fields;
  logLocaleVideoEvent(logger, 'video:render-metrics', {
    ...eventFields,
    realtime: (fields.durationMs / Math.max(fields.wallMs, 1)).toFixed(3),
    nodeRssMb: bytesToMb(process.memoryUsage().rss),
    ...(currentBytes === null
      ? {}
      : { cgroupCurrentMb: bytesToMb(currentBytes) }),
    ...(observedPeakBytes === null
      ? {}
      : { cgroupPeakObservedMb: bytesToMb(observedPeakBytes) }),
  });
}

export const processEpisodeVideoJob = createEpisodeVideoProcessor();
/* jscpd:ignore-end */
