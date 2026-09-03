import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { contentTypeExtension } from '../lib/content-type.js';
import {
  applyAndValidatePodcastBrandingToStoryboard,
  getEnglishBodyScript,
  getPodcastEditorialScript,
  getPodcastEditorialSentences,
  podcastBrandVisualKind,
  splitPodcastVisualSections,
} from './podcast-packaging.js';
import { scrapeArticle } from './scrape.js';
import { uploadEpisodeVisualAssetsToR2 } from './storage.js';
import { analyzeEpisodeAudio } from './video/episode-video.js';
import {
  buildEpisodeVisualPayload,
  EPISODE_VISUAL_PAYLOAD_SCHEMA_VERSION,
  EPISODE_VISUAL_STORYBOARD_PROMPT_VERSION,
  hashEpisodeVisualSelection,
  type VisualSearchTraceEntry,
} from './video/episode-visual.js';
import { planPodcastVisualAssets } from './video/podcast-visual-assets.js';
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
import { enrichStoryboardSearchIntents } from './video/storyboard/search-intents.js';
import { splitCanonicalSentences } from './video/storyboard/sentences.js';
import {
  buildVisualSubjectSearchQueries,
  type VisualSceneSubjectAssignment,
  type VisualSubjectCatalog,
  visualSubjectsForScene,
} from './video/storyboard/subject-catalog.js';
import type { VisualAssetProgress } from './video/visual-asset-planner.js';
import {
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoVisualCompletion,
  type EpisodeVideoVisualJobRow,
  type EpisodeVideoVisualSource,
  hashEpisodeVideoVisualSource,
  type ProcessEpisodeVideoVisualJobContext,
} from './video-jobs.js';
import { saveEpisodeVideoVisualDebug } from './video-visual-debug.js';
import { visualStageProgress } from './video-progress.js';

export const VISUAL_ARTICLE_SCRAPE_TIMEOUT_MS = 15_000;
const MAX_PERSISTED_VISUAL_SEARCH_TRACE_ENTRIES = 256;
const VISUAL_SEARCH_DEBUG_SCHEMA_VERSION = 'visual-search-debug-v1';

export type ProcessEpisodeVideoVisualJob = (
  job: EpisodeVideoVisualJobRow,
  source: EpisodeVideoVisualSource,
  context: ProcessEpisodeVideoVisualJobContext,
) => Promise<EpisodeVideoVisualCompletion>;

type PersistVisualDebug = (
  episodeId: string,
  leaseOwner: string,
  payload: Record<string, unknown>,
) => Promise<boolean>;

interface EpisodeVideoVisualProcessorDependencies {
  analyzeAudio: typeof analyzeEpisodeAudio;
  generateStoryboard: typeof generateVisualStoryboard;
  enrichSearchIntents: typeof enrichStoryboardSearchIntents;
  scrape: typeof scrapeArticle;
  planAssets: typeof planPodcastVisualAssets;
  upload: typeof uploadEpisodeVisualAssetsToR2;
  makeTemporaryDirectory: (prefix: string) => Promise<string>;
  writeManifest: typeof writeFile;
  removeDirectory: typeof rm;
  persistDebug: PersistVisualDebug;
  logger: Pick<Console, 'info'>;
}

const defaultDependencies: EpisodeVideoVisualProcessorDependencies = {
  analyzeAudio: analyzeEpisodeAudio,
  generateStoryboard: generateVisualStoryboard,
  enrichSearchIntents: enrichStoryboardSearchIntents,
  scrape: scrapeArticle,
  planAssets: planPodcastVisualAssets,
  upload: uploadEpisodeVisualAssetsToR2,
  makeTemporaryDirectory: mkdtemp,
  writeManifest: writeFile,
  removeDirectory: rm,
  // Unit callers of the factory stay isolated from Supabase. The production
  // singleton at the bottom wires the durable checkpoint writer explicitly.
  persistDebug: async () => true,
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
      context.reportProgress(visualStageProgress('analyzing-audio', 0));
      const analysis = await dependencies.analyzeAudio(source.hlsUrl, {
        signal: context.signal,
      });
      context.reportProgress(visualStageProgress('analyzing-audio'));
      const visualSections = splitPodcastVisualSections(source.script);
      logVisualProgress(dependencies.logger, 'visual:sections', {
        run: context.runId,
        episode: source.episodeId,
        intro: String(visualSections.intro ? 1 : 0),
        body: String(visualSections.body.length),
        outro: String(visualSections.outro ? 1 : 0),
      });
      const editorialScript = getPodcastEditorialScript(source.script);
      const englishBodyScript = getEnglishBodyScript(
        source.englishScript,
        visualSections.isPackaged,
      );
      // Visual identity follows the publisher headline, not a localized title
      // that editorial packaging may have rewritten and stripped proper nouns
      // from. English body text remains useful search evidence for scenes.
      const publisherTitle = source.sourceTitle?.trim();
      const englishTitle = source.englishTitle.trim();
      const visualSearchTitle = publisherTitle || englishTitle;
      let searchTitleSource: 'publisher' | 'english-localization' | 'none' =
        'none';
      if (publisherTitle) {
        searchTitleSource = 'publisher';
      } else if (englishTitle) {
        searchTitleSource = 'english-localization';
      }
      const editorialSentences = getPodcastEditorialSentences(source.script);
      const generated = await dependencies.generateStoryboard({
        title: source.title,
        script: source.script,
        editorialScript,
        editorialSentences,
        isPackaged: visualSections.isPackaged,
        ...(visualSearchTitle ? { searchTitle: visualSearchTitle } : {}),
        searchScript: englishBodyScript,
        durationMs: analysis.durationMs,
        signal: context.signal,
      });
      logVisualProgress(dependencies.logger, 'visual:storyboard', {
        run: context.runId,
        episode: source.episodeId,
        editorialSentences: String(visualSections.body.length),
        packagingExcluded: String(
          visualSections.isPackaged
            ? splitCanonicalSentences(source.script).length -
                visualSections.body.length
            : 0,
        ),
        searchTitleSource,
      });
      const brandedDraft = applyAndValidatePodcastBrandingToStoryboard(
        source.script,
        generated.draft,
        analysis.durationMs,
      );
      const brandSceneCount = brandedDraft.scenes.filter(
        (scene) => podcastBrandVisualKind(scene.imageSearchIntent) !== null,
      ).length;
      if (brandSceneCount === 0) {
        logVisualProgress(dependencies.logger, 'visual:branding', {
          run: context.runId,
          episode: source.episodeId,
          status: 'skipped',
          reason: 'unpackaged-script',
        });
      } else {
        const outroScene = brandedDraft.scenes.find(
          (scene) =>
            podcastBrandVisualKind(scene.imageSearchIntent) === 'outro',
        );
        if (outroScene) {
          logVisualProgress(dependencies.logger, 'visual:branding', {
            run: context.runId,
            episode: source.episodeId,
            kind: 'zap-pilot-outro',
            sceneId: outroScene.sceneId,
          });
        }
      }

      const intents = await dependencies.enrichSearchIntents(
        {
          draft: brandedDraft,
          title: source.title,
          ...(visualSearchTitle ? { searchTitle: visualSearchTitle } : {}),
          script: source.script,
          ...(englishBodyScript ? { searchScript: englishBodyScript } : {}),
          durationMs: analysis.durationMs,
        },
        { signal: context.signal },
      );
      // Narrow injected test providers created before v8 can still return the
      // old enrichment shape at runtime. Treat those as the explicit legacy
      // path; the production provider always supplies both v8 fields.
      const subjectCatalog = intents.subjectCatalog ?? null;
      const sceneAssignments = intents.sceneAssignments ?? [];
      const storyboard = {
        ...generated,
        draft: intents.draft,
      };
      logVisualProgress(dependencies.logger, 'visual:intents', {
        run: context.runId,
        episode: source.episodeId,
        enriched: `${intents.enrichedSceneCount}/${intents.draft.scenes.length}`,
        brand: brandSceneCount,
        entities: intents.entityAnchoredSceneCount,
        subjects: subjectCatalog?.subjects.length,
        primarySubject: subjectCatalog?.primarySubjectId,
        model: intents.model ?? 'deterministic',
      });

      const debugPayload = buildVisualSearchDebugPayload({
        subjectCatalog,
        sceneAssignments,
        scenes: storyboard.draft.scenes,
        searchTitleSource,
        model: intents.model,
      });
      if (job.lease_owner) {
        const persisted = await dependencies.persistDebug(
          source.episodeId,
          job.lease_owner,
          debugPayload,
        );
        if (!persisted) {
          throw new Error('Visual search debug checkpoint lost its job lease');
        }
      }

      context.reportProgress(visualStageProgress('planning-scenes'));
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
      const articleImageCandidateCount = article.images?.length ?? 0;
      logVisualProgress(dependencies.logger, 'visual:search', {
        run: context.runId,
        episode: source.episodeId,
        phase: 'article-images',
        candidateCount: articleImageCandidateCount,
        elapsedMs: Date.now() - searchStartedAt,
      });

      const searchTrace: VisualSearchTraceEntry[] = [];
      const assetPlan = await dependencies.planAssets({
        scenes: storyboard.draft.scenes,
        articleImages: article.images ?? [],
        workingDirectory: join(outputDirectory, 'images'),
        selectionMode: 'resilient',
        signal: context.signal,
        ...(subjectCatalog ? { subjectCatalog } : {}),
        ...(sceneAssignments.length > 0 ? { sceneAssignments } : {}),
        onProgress: (progress) => {
          logPlannerProgress(
            dependencies.logger,
            context.runId,
            source.episodeId,
            progress,
          );
          appendSearchTrace(searchTrace, progress);
          if (progress.phase === 'assets') {
            context.reportProgress(
              visualStageProgress(
                'selecting-images',
                progress.sceneIndex / progress.sceneCount,
              ),
            );
          }
        },
      });
      const visualHash = hashEpisodeVisualSelection({
        visualVersion: job.visual_version,
        episodeId: source.episodeId,
        canonicalLocalizationId: source.canonicalLocalizationId,
        scenes: storyboard.draft.scenes,
        selectedScenes: assetPlan.scenes,
        assets: assetPlan.assets,
        subjectCatalog,
        sceneAssignments,
      });
      const manifestPath = join(outputDirectory, 'visual-manifest.json');
      const sourceManifest = createSourceVisualManifest({
        job,
        source,
        storyboard,
        visualHash,
        assetPlan,
        subjectCatalog,
        sceneAssignments,
      });
      await dependencies.writeManifest(
        manifestPath,
        `${JSON.stringify(sourceManifest, null, 2)}\n`,
        'utf8',
      );
      context.signal.throwIfAborted();

      context.reportProgress(visualStageProgress('uploading-visuals', 0));
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
        articleAssetCount: assetPlan.assets.filter(
          (asset) => asset.provider === 'article',
        ).length,
        elapsedMs: Date.now() - uploadStartedAt,
      });

      const payload = buildEpisodeVisualPayload({
        visualVersion: job.visual_version,
        visualHash,
        episodeId: source.episodeId,
        canonicalLocalizationId: source.canonicalLocalizationId,
        manifestUrl: uploaded.manifestUrl,
        storyboard,
        searchIntentModel: intents.model,
        selectedScenes: assetPlan.scenes,
        assets: assetPlan.assets,
        r2ImageUrls: uploaded.imageUrls,
        subjectCatalog,
        sceneAssignments,
        searchTitleSource,
        articleImageCandidateCount,
        searchTrace,
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

function buildVisualSearchDebugPayload(input: {
  subjectCatalog: VisualSubjectCatalog | null;
  sceneAssignments: readonly VisualSceneSubjectAssignment[];
  scenes: readonly { sceneId: string; imageSearchIntent: readonly string[] }[];
  searchTitleSource: 'publisher' | 'english-localization' | 'none';
  model: string | null;
}): Record<string, unknown> {
  const assignmentByScene = new Map(
    input.sceneAssignments.map((assignment) => [assignment.sceneId, assignment]),
  );
  const plannedQueries = input.scenes.flatMap((scene) => {
    if (podcastBrandVisualKind(scene.imageSearchIntent)) return [];
    const assignment = assignmentByScene.get(scene.sceneId);
    if (!input.subjectCatalog || !assignment) {
      return [
        {
          sceneId: scene.sceneId,
          subjectIds: [],
          selectionReason: 'legacy',
          queries: [...scene.imageSearchIntent],
        },
      ];
    }
    const subjects = visualSubjectsForScene(input.subjectCatalog, assignment);
    return [
      {
        sceneId: scene.sceneId,
        subjectIds: assignment.subjectIds,
        selectionReason: assignment.selectionReason,
        queries: [
          ...new Set(subjects.flatMap(buildVisualSubjectSearchQueries)),
        ].slice(0, 3),
      },
    ];
  });
  return {
    schemaVersion: VISUAL_SEARCH_DEBUG_SCHEMA_VERSION,
    phase: 'planned',
    searchTitleSource: input.searchTitleSource,
    searchIntentModel: input.model,
    subjectCatalog: input.subjectCatalog,
    sceneAssignments: input.sceneAssignments,
    plannedQueries,
  };
}

function appendSearchTrace(
  trace: VisualSearchTraceEntry[],
  progress: VisualAssetProgress,
): void {
  if (
    trace.length >= MAX_PERSISTED_VISUAL_SEARCH_TRACE_ENTRIES ||
    progress.phase !== 'search' ||
    !progress.searchIntent ||
    (progress.provider !== 'pexels' &&
      progress.provider !== 'pixabay' &&
      progress.provider !== 'brave')
  ) {
    return;
  }
  trace.push({
    sceneId: progress.sceneId,
    provider: progress.provider,
    intent: progress.searchIntent,
    subjectKey: progress.subjectKey ?? null,
    returned: progress.searchResultCount ?? 0,
    accepted: progress.candidateCount ?? 0,
    entityFiltered: progress.entityFilteredCount ?? 0,
    rejected: progress.rejectedCandidateCount ?? 0,
  });
}

export async function generateVisualStoryboard(input: {
  title: string;
  script: string;
  editorialScript?: string;
  editorialSentences?: readonly import('./video/storyboard/sentences.js').CanonicalSentence[];
  isPackaged?: boolean;
  searchTitle?: string;
  searchScript?: string;
  durationMs: number;
  signal?: AbortSignal;
  provider?: StoryboardProvider;
}): Promise<StoryboardGenerationResult> {
  const visualSections = splitPodcastVisualSections(input.script);
  const isPackaged = input.isPackaged ?? visualSections.isPackaged;
  const editorialScript =
    input.editorialScript ?? getPodcastEditorialScript(input.script);
  const editorialSentences =
    input.editorialSentences ?? getPodcastEditorialSentences(input.script);
  const providerScript = isPackaged ? editorialScript : input.script;
  const providerSentences = isPackaged
    ? editorialSentences
    : splitCanonicalSentences(input.script);
  let englishBody: string | undefined;
  if (input.searchScript !== undefined) {
    englishBody =
      input.editorialSentences !== undefined
        ? input.searchScript
        : getEnglishBodyScript(input.searchScript, isPackaged);
  }
  return generateStoryboard({
    title: input.title,
    script: providerScript,
    durationMs: input.durationMs,
    sentences: providerSentences,
    ...(isPackaged ? { isPackaged } : {}),
    provider:
      input.provider ??
      configuredStoryboardProvider({
        ...(input.searchTitle ? { searchTitle: input.searchTitle } : {}),
        ...(englishBody ? { searchScript: englishBody } : {}),
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
  assetPlan: Awaited<ReturnType<typeof planPodcastVisualAssets>>;
  subjectCatalog: VisualSubjectCatalog | null;
  sceneAssignments: readonly VisualSceneSubjectAssignment[];
}): Record<string, unknown> {
  return {
    schemaVersion: EPISODE_VISUAL_PAYLOAD_SCHEMA_VERSION,
    visualVersion: input.job.visual_version,
    visualHash: input.visualHash,
    sourceHash: input.job.source_hash,
    episodeId: input.source.episodeId,
    canonicalLocalizationId: input.source.canonicalLocalizationId,
    ...(input.subjectCatalog
      ? {
          subjectCatalog: input.subjectCatalog,
          sceneAssignments: input.sceneAssignments,
        }
      : {}),
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
  if (progress.phase === 'cover') {
    logVisualProgress(logger, 'visual:cover', {
      run: runId,
      episode: episodeId,
      candidates: String(progress.candidateCount ?? 0),
      selected: progress.assetId ?? 'none',
      fallback: String(
        progress.candidateCount === 0 || progress.assetId === 'none',
      ),
      elapsedMs: progress.elapsedMs,
    });
    return;
  }
  logVisualProgress(logger, `visual:${progress.phase}`, {
    run: runId,
    episode: episodeId,
    sceneId: progress.sceneId,
    progress: `${progress.sceneIndex}/${progress.sceneCount}`,
    provider: progress.provider,
    assetId: progress.assetId,
    sourceHostname: progress.sourceHostname,
    reuseKind: progress.reuseKind,
    candidateCount: progress.candidateCount,
    searchResultCount: progress.searchResultCount,
    entityFilteredCount: progress.entityFilteredCount,
    searchEntities: progress.searchEntities,
    searchIntent: progress.searchIntent,
    subjectKey: progress.subjectKey,
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

export const processEpisodeVideoVisualJob = createEpisodeVideoVisualProcessor({
  persistDebug: saveEpisodeVideoVisualDebug,
});
