import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { uploadVideoArtifactsToR2 } from './storage.js';
import {
  analyzeEpisodeAudio,
  createEpisodeVideoManifest,
} from './video/episode-video.js';
import { parseEpisodeVisualPayload } from './video/episode-visual.js';
import { renderSlideVideo } from './video/renderer.js';
import type { ProcessEpisodeVideoJob } from './video-worker.js';

/* jscpd:ignore-start -- dependency injection factory pattern, irreducible by design */

interface EpisodeVideoProcessorDependencies {
  analyzeAudio: typeof analyzeEpisodeAudio;
  createManifest: typeof createEpisodeVideoManifest;
  render: typeof renderSlideVideo;
  upload: typeof uploadVideoArtifactsToR2;
  makeTemporaryDirectory: (prefix: string) => Promise<string>;
  writeManifest: typeof writeFile;
  removeDirectory: typeof rm;
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

    const analysis = await dependencies.analyzeAudio(source.hlsUrl, {
      signal: context.signal,
    });
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
      const rendered = await dependencies.render({
        manifestPath,
        outputDirectory,
        audioSource: source.hlsUrl,
        signal: context.signal,
        onProgress: (message) =>
          logRenderProgress(
            dependencies.logger,
            context.runId,
            source.episodeId,
            source.languageCode,
            message,
          ),
      });
      if (rendered.manifestHash !== generated.manifestHash) {
        throw new Error('Rendered manifest hash differs from persisted hash');
      }

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

function logRenderProgress(
  logger: Pick<Console, 'info'>,
  runId: string,
  episodeId: string,
  languageCode: string,
  message: string,
): void {
  const sceneProgress = /^Rendering slide (\d+)\/(\d+): (scene-\d+)$/.exec(
    message,
  );
  logLocaleVideoEvent(logger, 'video:render', {
    run: runId,
    episode: episodeId,
    language: languageCode,
    phase: sceneProgress ? 'scene' : 'encoding',
    ...(sceneProgress
      ? {
          scene: sceneProgress[3],
          progress: `${sceneProgress[1]}/${sceneProgress[2]}`,
        }
      : {}),
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

export const processEpisodeVideoJob = createEpisodeVideoProcessor();
/* jscpd:ignore-end */
