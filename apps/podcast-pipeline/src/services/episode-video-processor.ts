import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { uploadVideoArtifactsToR2 } from './storage.js';
import {
  analyzeEpisodeAudio,
  createEpisodeVideoManifest,
} from './video/episode-video.js';
import { renderSlideVideo } from './video/renderer.js';
import type { ProcessEpisodeVideoJob } from './video-worker.js';

interface EpisodeVideoProcessorDependencies {
  analyzeAudio: typeof analyzeEpisodeAudio;
  createManifest: typeof createEpisodeVideoManifest;
  render: typeof renderSlideVideo;
  upload: typeof uploadVideoArtifactsToR2;
  makeTemporaryDirectory: (prefix: string) => Promise<string>;
  writeManifest: typeof writeFile;
  removeDirectory: typeof rm;
}

const defaultDependencies: EpisodeVideoProcessorDependencies = {
  analyzeAudio: analyzeEpisodeAudio,
  createManifest: createEpisodeVideoManifest,
  render: renderSlideVideo,
  upload: uploadVideoArtifactsToR2,
  makeTemporaryDirectory: mkdtemp,
  writeManifest: writeFile,
  removeDirectory: rm,
};

export function createEpisodeVideoProcessor(
  overrides: Partial<EpisodeVideoProcessorDependencies> = {},
): ProcessEpisodeVideoJob {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async (_job, source, context) => {
    context.signal.throwIfAborted();
    const analysis = await dependencies.analyzeAudio(source.hlsUrl, {
      signal: context.signal,
    });
    const generated = await dependencies.createManifest({
      episodeId: source.episodeId,
      localizationId: source.localizationId,
      languageCode: source.languageCode,
      title: source.title,
      script: source.script,
      hlsUrl: source.hlsUrl,
      sourceUrl: source.sourceUrl,
      durationMs: analysis.durationMs,
      silences: analysis.silences,
      signal: context.signal,
    });

    await context.saveManifest({
      manifest: JSON.parse(generated.manifestJson) as Record<string, unknown>,
      manifestHash: generated.manifestHash,
      rendererVersion: generated.provenance.rendererVersion,
      storyboardProvider: generated.provenance.effectiveProvider,
      storyboardModel: generated.provenance.model,
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
        durationSeconds: analysis.durationMs / 1_000,
      };
    } finally {
      await dependencies.removeDirectory(outputDirectory, {
        recursive: true,
        force: true,
      });
    }
  };
}

export const processEpisodeVideoJob = createEpisodeVideoProcessor();
