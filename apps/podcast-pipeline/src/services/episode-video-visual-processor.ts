import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { contentTypeExtension } from '../lib/content-type.js';
import { scrapeArticle } from './scrape.js';
import { uploadEpisodeVisualAssetsToR2 } from './storage.js';
import { analyzeEpisodeAudio } from './video/episode-video.js';
import {
  buildEpisodeVisualPayload,
  EPISODE_VISUAL_PAYLOAD_SCHEMA_VERSION,
  EPISODE_VISUAL_STORYBOARD_PROMPT_VERSION,
  hashEpisodeVisualSelection,
} from './video/episode-visual.js';
import {
  createDeterministicStoryboardProvider,
  type DeterministicStoryboardSearchContext,
} from './video/storyboard/fallback.js';
import { createNvidiaStoryboardProvider } from './video/storyboard/nvidia.js';
import {
  generateStoryboard,
  type StoryboardGenerationResult,
} from './video/storyboard/orchestrator.js';
import type { StoryboardProvider } from './video/storyboard/provider.js';
import {
  planVisualAssets,
  type VisualAssetProgress,
} from './video/visual-asset-planner.js';
import {
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoVisualCompletion,
  type EpisodeVideoVisualJobRow,
  type EpisodeVideoVisualSource,
  hashEpisodeVideoVisualSource,
  type ProcessEpisodeVideoVisualJobContext,
} from './video-jobs.js';

export const VISUAL_ARTICLE_SCRAPE_TIMEOUT_MS = 15_000;

export type ProcessEpisodeVideoVisualJob = (
  job: EpisodeVideoVisualJobRow,
  source: EpisodeVideoVisualSource,
  context: ProcessEpisodeVideoVisualJobContext,
) => Promise<EpisodeVideoVisualCompletion>;

interface EpisodeVideoVisualProcessorDependencies {
  analyzeAudio: typeof analyzeEpisodeAudio;
  generateStoryboard: typeof generateVisualStoryboard;
  scrape: typeof scrapeArticle;
  planAssets: typeof planVisualAssets;
  upload: typeof uploadEpisodeVisualAssetsToR2;
  makeTemporaryDirectory: (prefix: string) => Promise<string>;
  writeManifest: typeof writeFile;
  removeDirectory: typeof rm;
  logger: Pick<Console, 'info'>;
}

const defaultDependencies: EpisodeVideoVisualProcessorDependencies = {
  analyzeAudio: analyzeEpisodeAudio,
  generateStoryboard: generateVisualStoryboard,
  scrape: scrapeArticle,
  planAssets: planVisualAssets,
  upload: uploadEpisodeVisualAssetsToR2,
  makeTemporaryDirectory: mkdtemp,
  writeManifest: writeFile,
  removeDirectory: rm,
  logger: console,
};

export function createEpisodeVideoVisualProcessor(
  overrides: Partial<EpisodeVideoVisualProcessorDependencies> = {},
): ProcessEpisodeVideoVisualJob {
  const dependencies = { ...defaultDependencies, ...overrides };

  return async (job, source, context) => {
    context.signal.throwIfAborted();
    assertCurrentVisualJob(job, source);
    const outputDirectory = await dependencies.makeTemporaryDirectory(
      join(tmpdir(), 'episode-video-visual-worker-'),
    );

    try {
      const analysis = await dependencies.analyzeAudio(source.hlsUrl, {
        signal: context.signal,
      });
      const storyboard = await dependencies.generateStoryboard({
        title: source.title,
        script: source.script,
        searchTitle: source.englishTitle,
        searchScript: source.englishScript,
        durationMs: analysis.durationMs,
        signal: context.signal,
      });

      const searchStartedAt = Date.now();
      logVisualProgress(dependencies.logger, 'visual:search', {
        run: context.runId,
        episode: source.episodeId,
        phase: 'start',
      });
      const article = await dependencies.scrape(source.sourceUrl, {
        signal: context.signal,
        timeoutMs: VISUAL_ARTICLE_SCRAPE_TIMEOUT_MS,
      });
      logVisualProgress(dependencies.logger, 'visual:search', {
        run: context.runId,
        episode: source.episodeId,
        phase: 'article-images',
        candidateCount: article.images?.length ?? 0,
        elapsedMs: Date.now() - searchStartedAt,
      });

      const assetPlan = await dependencies.planAssets({
        scenes: storyboard.draft.scenes,
        articleImages: article.images ?? [],
        workingDirectory: join(outputDirectory, 'images'),
        signal: context.signal,
        onProgress: (progress) =>
          logPlannerProgress(
            dependencies.logger,
            context.runId,
            source.episodeId,
            progress,
          ),
      });
      const visualHash = hashEpisodeVisualSelection({
        visualVersion: job.visual_version,
        episodeId: source.episodeId,
        canonicalLocalizationId: source.canonicalLocalizationId,
        scenes: storyboard.draft.scenes,
        selectedScenes: assetPlan.scenes,
        assets: assetPlan.assets,
      });
      const manifestPath = join(outputDirectory, 'visual-manifest.json');
      const sourceManifest = createSourceVisualManifest({
        job,
        source,
        storyboard,
        visualHash,
        assetPlan,
      });
      await dependencies.writeManifest(
        manifestPath,
        `${JSON.stringify(sourceManifest, null, 2)}\n`,
        'utf8',
      );
      context.signal.throwIfAborted();

      const uploadStartedAt = Date.now();
      const uploaded = await dependencies.upload({
        episodeId: source.episodeId,
        visualVersion: job.visual_version,
        visualHash,
        manifestPath,
        images: assetPlan.assets.map((asset) => ({
          sceneId: asset.assetId,
          path: asset.path,
          contentType: asset.contentType,
        })),
        signal: context.signal,
      });
      logVisualProgress(dependencies.logger, 'visual:assets', {
        run: context.runId,
        episode: source.episodeId,
        phase: 'uploaded',
        candidateCount: assetPlan.assets.length,
        elapsedMs: Date.now() - uploadStartedAt,
      });

      const payload = buildEpisodeVisualPayload({
        visualVersion: job.visual_version,
        visualHash,
        episodeId: source.episodeId,
        canonicalLocalizationId: source.canonicalLocalizationId,
        manifestUrl: uploaded.manifestUrl,
        storyboard,
        selectedScenes: assetPlan.scenes,
        assets: assetPlan.assets,
        r2ImageUrls: uploaded.imageUrls,
      });
      return {
        visualPayload: payload,
        visualHash,
        visualVersion: job.visual_version,
        sourceHash: job.source_hash,
        r2Prefix: uploaded.r2Prefix,
      };
    } finally {
      await dependencies.removeDirectory(outputDirectory, {
        recursive: true,
        force: true,
      });
    }
  };
}

export async function generateVisualStoryboard(input: {
  title: string;
  script: string;
  searchTitle?: string;
  searchScript?: string;
  durationMs: number;
  signal?: AbortSignal;
  provider?: StoryboardProvider;
}): Promise<StoryboardGenerationResult> {
  return generateStoryboard({
    title: input.title,
    script: input.script,
    durationMs: input.durationMs,
    provider:
      input.provider ??
      configuredStoryboardProvider({
        ...(input.searchTitle ? { searchTitle: input.searchTitle } : {}),
        ...(input.searchScript ? { searchScript: input.searchScript } : {}),
      }),
    ...(input.signal ? { signal: input.signal } : {}),
  });
}

function configuredStoryboardProvider(
  searchContext: Partial<DeterministicStoryboardSearchContext>,
): StoryboardProvider {
  const providerName =
    process.env['VIDEO_STORYBOARD_PROVIDER']?.trim() ?? 'deterministic';
  if (providerName === 'nvidia') return createNvidiaStoryboardProvider();
  if (providerName === 'deterministic') {
    return createDeterministicStoryboardProvider(searchContext);
  }
  throw new Error(`Unsupported VIDEO_STORYBOARD_PROVIDER: ${providerName}`);
}

function assertCurrentVisualJob(
  job: EpisodeVideoVisualJobRow,
  source: EpisodeVideoVisualSource,
): void {
  if (job.visual_version !== EPISODE_VIDEO_VISUAL_VERSION) {
    throw new Error(
      `Unsupported episode visual version: ${job.visual_version}`,
    );
  }
  const sourceHash = hashEpisodeVideoVisualSource(
    source.script,
    source.englishScript,
  );
  if (sourceHash !== job.source_hash) {
    throw new Error('Episode visual source changed after the job was claimed');
  }
}

function createSourceVisualManifest(input: {
  job: EpisodeVideoVisualJobRow;
  source: EpisodeVideoVisualSource;
  storyboard: StoryboardGenerationResult;
  visualHash: string;
  assetPlan: Awaited<ReturnType<typeof planVisualAssets>>;
}): Record<string, unknown> {
  return {
    schemaVersion: EPISODE_VISUAL_PAYLOAD_SCHEMA_VERSION,
    visualVersion: input.job.visual_version,
    visualHash: input.visualHash,
    sourceHash: input.job.source_hash,
    episodeId: input.source.episodeId,
    canonicalLocalizationId: input.source.canonicalLocalizationId,
    storyboard: {
      provider: input.storyboard.effectiveProvider,
      model: input.storyboard.model,
      promptVersion: EPISODE_VISUAL_STORYBOARD_PROMPT_VERSION,
      scenes: input.storyboard.draft.scenes.map((scene) => ({
        ...scene,
        assetId: input.assetPlan.scenes.find(
          (selection) => selection.sceneId === scene.sceneId,
        )?.assetId,
      })),
    },
    assets: input.assetPlan.assets.map((asset) => ({
      assetId: asset.assetId,
      relativePath: `images/${asset.assetId}.${contentTypeExtension(
        asset.contentType,
      )}`,
      originalImageUrl: asset.originalImageUrl,
      sourcePageUrl: asset.sourcePageUrl,
      provider: asset.provider,
      license: asset.license,
      contentType: asset.contentType,
      sha256: asset.sha256,
      perceptualHash: asset.perceptualHash,
      width: asset.width,
      height: asset.height,
    })),
  };
}

function logPlannerProgress(
  logger: Pick<Console, 'info'>,
  runId: string,
  episodeId: string,
  progress: VisualAssetProgress,
): void {
  logVisualProgress(logger, `visual:${progress.phase}`, {
    run: runId,
    episode: episodeId,
    sceneId: progress.sceneId,
    progress: `${progress.sceneIndex}/${progress.sceneCount}`,
    provider: progress.provider,
    candidateCount: progress.candidateCount,
    rejectedCandidateCount: progress.rejectedCandidateCount,
    rejectionSummary: progress.rejectionSummary,
    elapsedMs: progress.elapsedMs,
  });
}

function logVisualProgress(
  logger: Pick<Console, 'info'>,
  event: string,
  fields: Record<string, string | number | undefined>,
): void {
  const details = Object.entries({ ...fields, language: 'shared' })
    .flatMap(([key, value]) => (value === undefined ? [] : [`${key}=${value}`]))
    .join(' ');
  logger.info(`[video-worker] ${event} ${details}`);
}

export const processEpisodeVideoVisualJob = createEpisodeVideoVisualProcessor();
