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
import {
  uploadEpisodeVisualAssetsToR2,
  uploadEpisodeVisualCheckpointImageToR2,
} from './storage.js';
import {
  deriveSearchSubjects,
  IMAGE_SEARCH_BUDGET,
  plannedPrimarySubjects,
  type PoolSubjectScene,
} from './video/episode-image-pool.js';
import { analyzeEpisodeAudio } from './video/episode-video.js';
import {
  buildEpisodeVisualPayload,
  EPISODE_VISUAL_PAYLOAD_SCHEMA_VERSION,
  EPISODE_VISUAL_STORYBOARD_PROMPT_VERSION,
  hashEpisodeVisualSelection,
  sceneSentencesForDraft,
} from './video/episode-visual.js';
import {
  appendImageSearchProgress,
  createImageSearchTrace,
  type VisualImageSearch,
} from './video/image-search-trace.js';
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
import type {
  VisualSceneSubjectAssignment,
  VisualSubjectCatalog,
} from './video/storyboard/subject-catalog.js';
import type {
  VisualAssetPlan,
  VisualAssetProgress,
} from './video/visual-asset-planner.js';
import {
  appendVisualCheckpointScene,
  buildVisualCheckpoint,
  type DownloadCheckpointImage,
  downloadVisualCheckpointImage,
  parseVisualCheckpoint,
  restoreVisualCheckpointPlan,
  restoreVisualStoryboard,
  type VisualCheckpoint,
} from './video/visual-checkpoint.js';
import {
  buildVisualFailureDiagnostics,
  type VisualFailureStage,
  VisualPlanningError,
} from './video/visual-diagnostics.js';
import {
  EPISODE_VIDEO_VISUAL_VERSION,
  type EpisodeVideoVisualCompletion,
  type EpisodeVideoVisualJobRow,
  type EpisodeVideoVisualSource,
  hashEpisodeVideoVisualSource,
  type ProcessEpisodeVideoVisualJobContext,
} from './video-jobs.js';
import { visualStageProgress } from './video-progress.js';
import { saveEpisodeVideoVisualDebug } from './video-visual-debug.js';

export const VISUAL_ARTICLE_SCRAPE_TIMEOUT_MS = 15_000;
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
  uploadCheckpointImage: typeof uploadEpisodeVisualCheckpointImageToR2;
  downloadCheckpointImage: DownloadCheckpointImage;
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
  uploadCheckpointImage: uploadEpisodeVisualCheckpointImageToR2,
  downloadCheckpointImage: downloadVisualCheckpointImage,
  makeTemporaryDirectory: mkdtemp,
  writeManifest: writeFile,
  removeDirectory: rm,
  persistDebug: saveEpisodeVideoVisualDebug,
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
    let failureStage: VisualFailureStage = 'analyze-audio';
    const failureSnapshot: Record<string, unknown> = {};

    const identity = {
      visualVersion: job.visual_version,
      sourceHash: job.source_hash,
    };
    const resumed = parseVisualCheckpoint(job.checkpoint, identity);

    try {
      const visualSections = splitPodcastVisualSections(source.script);
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

      const prepareStoryboard = async (): Promise<PreparedStoryboard> => {
        context.reportProgress(visualStageProgress('analyzing-audio', 0));
        const analysis = await dependencies.analyzeAudio(source.hlsUrl, {
          signal: context.signal,
        });
        context.reportProgress(visualStageProgress('analyzing-audio'));
        logVisualProgress(dependencies.logger, 'visual:sections', {
          run: context.runId,
          episode: source.episodeId,
          intro: String(visualSections.intro ? 1 : 0),
          body: String(visualSections.body.length),
          outro: String(visualSections.outro ? 1 : 0),
        });
        const editorialScript = getPodcastEditorialScript(source.script);
        const editorialSentences = getPodcastEditorialSentences(source.script);
        failureStage = 'storyboard';
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
        failureStage = 'branding';
        const brandedDraft = applyAndValidatePodcastBrandingToStoryboard(
          source.script,
          generated.draft,
          analysis.durationMs,
        );
        logBranding(
          dependencies.logger,
          context.runId,
          source.episodeId,
          brandedDraft,
        );

        failureStage = 'search-intents';
        const intents = await dependencies.enrichSearchIntents(
          {
            draft: brandedDraft,
            title: source.title,
            ...(visualSearchTitle ? { searchTitle: visualSearchTitle } : {}),
            script: source.script,
            ...(englishBodyScript ? { searchScript: englishBodyScript } : {}),
          },
          { signal: context.signal },
        );
        logVisualProgress(dependencies.logger, 'visual:intents', {
          run: context.runId,
          episode: source.episodeId,
          enriched: `${intents.enrichedSceneCount}/${intents.draft.scenes.length}`,
          brand: countBrandScenes(brandedDraft),
          entities: intents.entityAnchoredSceneCount,
          subjects: intents.subjectCatalog?.subjects.length,
          primarySubject: intents.subjectCatalog?.primarySubjectId,
          model: intents.model ?? 'deterministic',
        });
        for (const droppedSubject of intents.subjectCatalog?.droppedSubjects ??
          []) {
          logVisualProgress(dependencies.logger, 'visual:intents', {
            run: context.runId,
            episode: source.episodeId,
            phase: 'dropped-subject',
            subject: droppedSubject.id,
            reason: droppedSubject.reason,
            names: JSON.stringify(droppedSubject.names.join(' / ')),
          });
        }
        // A catalog-less episode still plans, off the deterministic intents, so
        // the reason it degraded is the only thing that separates that from an
        // episode whose scenes simply name nobody.
        const subjectCatalogFailure = intents.degradedReason ?? null;
        if (subjectCatalogFailure) {
          logVisualProgress(dependencies.logger, 'visual:intents', {
            run: context.runId,
            episode: source.episodeId,
            phase: 'degraded',
            reason: subjectCatalogFailure,
          });
        }
        return {
          storyboard: { ...generated, draft: intents.draft },
          searchIntentModel: intents.model,
          subjectCatalog: intents.subjectCatalog,
          sceneAssignments: intents.sceneAssignments,
          subjectCatalogFailure,
          resumePlan: null,
        };
      };

      const prepared = resumed
        ? await restorePreparedStoryboard(resumed, {
            workingDirectory: join(outputDirectory, 'images'),
            signal: context.signal,
            download: dependencies.downloadCheckpointImage,
          })
        : await prepareStoryboard();
      const {
        storyboard,
        searchIntentModel,
        subjectCatalog,
        sceneAssignments,
        subjectCatalogFailure,
      } = prepared;
      failureSnapshot['searchIntentModel'] = searchIntentModel;
      failureSnapshot['subjectCatalog'] = subjectCatalog;
      failureSnapshot['sceneAssignments'] = sceneAssignments;
      failureSnapshot['scenes'] = storyboard.draft.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        imageSearchIntent: scene.imageSearchIntent,
        imageSearchEntities: scene.imageSearchEntities,
      }));
      const resumedSceneCount = prepared.resumePlan?.scenes.length ?? 0;
      failureSnapshot['resumedScenes'] = resumedSceneCount;

      let checkpoint: VisualCheckpoint =
        resumed ??
        buildVisualCheckpoint({
          identity,
          storyboard,
          searchIntentModel,
          subjectCatalog,
          subjectCatalogFailure,
          sceneAssignments,
          searchTitleSource,
        });
      if (resumed) {
        logVisualProgress(dependencies.logger, 'visual:checkpoint', {
          run: context.runId,
          episode: source.episodeId,
          phase: 'resumed',
          resumedScenes: `${resumed.scenes.length}/${storyboard.draft.scenes.length}`,
        });
      } else {
        await saveCheckpointOrThrow(context, checkpoint);
      }

      const debugPayload = buildVisualSearchDebugPayload({
        subjectCatalog,
        sceneAssignments,
        scenes: storyboard.draft.scenes,
        searchTitleSource,
        model: searchIntentModel,
        subjectCatalogFailure,
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
      failureStage = 'scrape-article';
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

      failureSnapshot['articleImageCandidateCount'] =
        articleImageCandidateCount;
      const sceneSentences = sceneSentencesForDraft(
        source.script,
        storyboard.draft,
      );
      const sceneEvidence = new Map(
        sceneSentences.map((scene) => {
          const searchText = storyboard.draft.scenes
            .find((candidate) => candidate.sceneId === scene.sceneId)
            ?.imageSearchIntent.join(' ');
          return [
            scene.sceneId,
            { text: scene.text, ...(searchText ? { searchText } : {}) },
          ] as const;
        }),
      );
      const trace = createImageSearchTrace(
        IMAGE_SEARCH_BUDGET,
        resumedSceneCount,
      );
      // Held by reference: the trace keeps accumulating into the snapshot, so
      // an attempt that dies before its first progress event still reports the
      // empty trace rather than no field at all.
      failureSnapshot['imageSearch'] = trace;
      let assetPlan: Awaited<ReturnType<typeof planPodcastVisualAssets>>;
      failureStage = 'plan-assets';
      try {
        assetPlan = await dependencies.planAssets({
          scenes: storyboard.draft.scenes,
          articleImages: article.images ?? [],
          workingDirectory: join(outputDirectory, 'images'),
          selectionMode: 'resilient',
          signal: context.signal,
          ...(prepared.resumePlan ? { resumePlan: prepared.resumePlan } : {}),
          onSelection: async (selection) => {
            // Best effort: a lost R2 write only costs the resume of this scene.
            // A lost lease must stop the job, exactly like the debug checkpoint.
            let r2Url: string;
            try {
              r2Url = await dependencies.uploadCheckpointImage({
                episodeId: source.episodeId,
                visualVersion: job.visual_version,
                sourceHash: job.source_hash,
                assetId: selection.asset.assetId,
                path: selection.asset.path,
                contentType: selection.asset.contentType,
                signal: context.signal,
              });
            } catch (error) {
              if (context.signal.aborted) throw error;
              logVisualProgress(dependencies.logger, 'visual:checkpoint', {
                run: context.runId,
                episode: source.episodeId,
                phase: 'image-upload-skipped',
                scene: selection.sceneId,
                error: error instanceof Error ? error.message : String(error),
              });
              return;
            }
            checkpoint = appendVisualCheckpointScene(checkpoint, {
              sceneId: selection.sceneId,
              asset: selection.asset,
              r2Url,
            });
            await saveCheckpointOrThrow(context, checkpoint);
          },
          slideFallback: {
            title: visualSearchTitle || source.title,
            sceneEvidence,
          },
          ...(subjectCatalog ? { subjectCatalog } : {}),
          ...(sceneAssignments.length > 0 ? { sceneAssignments } : {}),
          onProgress: (progress) => {
            appendImageSearchProgress(trace, progress);
            logPlannerProgress(
              dependencies.logger,
              context.runId,
              source.episodeId,
              progress,
              trace,
            );
            if (progress.phase === 'slide' && progress.assetId) {
              logVisualProgress(dependencies.logger, 'visual:slide', {
                run: context.runId,
                episode: source.episodeId,
                scene: progress.sceneId,
                asset: progress.assetId,
                rejectionSummary: progress.rejectionSummary ?? 'none',
                lead: String(progress.sceneIndex === 1),
              });
            }
            // Only a scene that actually got an image has advanced the bar; an
            // exhausted scene is about to fail the attempt, not to progress it.
            if (progress.phase === 'assets' || progress.phase === 'slide') {
              context.reportProgress(
                visualStageProgress(
                  'selecting-images',
                  progress.sceneIndex / progress.sceneCount,
                ),
              );
            }
          },
        });
      } catch (cause) {
        await persistSearchTraceCheckpoint({
          persistDebug: dependencies.persistDebug,
          episodeId: source.episodeId,
          leaseOwner: job.lease_owner,
          debugPayload,
          phase: 'search-failed',
          imageSearch: trace,
        });
        throw cause;
      }
      await persistSearchTraceCheckpoint({
        persistDebug: dependencies.persistDebug,
        episodeId: source.episodeId,
        leaseOwner: job.lease_owner,
        debugPayload,
        phase: 'searched',
        imageSearch: trace,
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
      failureStage = 'write-manifest';
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

      failureStage = 'upload';
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
        generatedSlideCount: assetPlan.assets.filter(
          (asset) => asset.provider === 'generated-slide',
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
        searchIntentModel,
        selectedScenes: assetPlan.scenes,
        assets: assetPlan.assets,
        r2ImageUrls: uploaded.imageUrls,
        subjectCatalog,
        sceneAssignments,
        searchTitleSource,
        articleImageCandidateCount,
        // The planner's own trace is authoritative; the accumulated one only
        // has to cover an attempt that threw before returning a plan.
        imageSearch: assetPlan.imageSearch ?? trace,
        ...(subjectCatalogFailure ? { subjectCatalogFailure } : {}),
        sceneSentences,
      });
      return {
        visualPayload: payload,
        visualHash,
        visualVersion: job.visual_version,
        sourceHash: job.source_hash,
        r2Prefix: uploaded.r2Prefix,
      };
    } catch (error) {
      if (context.signal.aborted || error instanceof VisualPlanningError) {
        throw error;
      }
      throw new VisualPlanningError(
        error,
        buildVisualFailureDiagnostics({
          visualVersion: job.visual_version,
          runId: context.runId,
          attempt: job.attempt_count,
          stage: failureStage,
          error,
          snapshot: failureSnapshot,
        }),
      );
    } finally {
      await dependencies.removeDirectory(outputDirectory, {
        recursive: true,
        force: true,
      });
    }
  };
}

interface VisualSearchDebugQuery {
  sceneId: string;
  subjectIds: string[];
  selectionReason: VisualSceneSubjectAssignment['selectionReason'];
  queries: string[];
}

function buildVisualSearchDebugPayload(input: {
  subjectCatalog: VisualSubjectCatalog | null;
  sceneAssignments: readonly VisualSceneSubjectAssignment[];
  scenes: readonly PoolSubjectScene[];
  searchTitleSource: 'publisher' | 'english-localization' | 'none';
  model: string | null;
  subjectCatalogFailure: string | null;
}): Record<string, unknown> {
  const assignmentByScene = new Map(
    input.sceneAssignments.map((assignment) => [
      assignment.sceneId,
      assignment,
    ]),
  );
  const contentScenes = input.scenes.filter(
    (scene) => podcastBrandVisualKind(scene.imageSearchIntent) === null,
  );
  const plannedQueries = contentScenes.flatMap<VisualSearchDebugQuery>(
    (scene) => {
      const assignment = assignmentByScene.get(scene.sceneId);
      if (!assignment) return [];
      // The planner already wrote each scene's queries onto the scene. Reading
      // them back is what makes this checkpoint evidence of what image search
      // was actually asked, rather than a third re-derivation that can drift.
      return [
        {
          sceneId: scene.sceneId,
          subjectIds: assignment.subjectIds,
          selectionReason: assignment.selectionReason,
          queries: [...scene.imageSearchIntent],
        },
      ];
    },
  );
  return {
    schemaVersion: VISUAL_SEARCH_DEBUG_SCHEMA_VERSION,
    phase: 'planned',
    searchTitleSource: input.searchTitleSource,
    searchIntentModel: input.model,
    ...(input.subjectCatalogFailure
      ? { subjectCatalogFailure: input.subjectCatalogFailure }
      : {}),
    subjectCatalog: input.subjectCatalog,
    sceneAssignments: input.sceneAssignments,
    plannedQueries,
    // The requests the episode is about to pay for, written before the first
    // one is sent: a budget-starved episode is only diagnosable against what
    // it intended to spend.
    plannedSubjectSearches: plannedPrimarySubjects(
      deriveSearchSubjects(contentScenes),
    ),
  };
}

async function persistSearchTraceCheckpoint(input: {
  persistDebug: PersistVisualDebug;
  episodeId: string;
  leaseOwner: string | null;
  debugPayload: Record<string, unknown>;
  phase: 'searched' | 'search-failed';
  imageSearch: VisualImageSearch;
}): Promise<void> {
  if (!input.leaseOwner) return;
  // An attempt that decided nothing and searched nothing would overwrite the
  // `planned` checkpoint with strictly less evidence than it already holds.
  if (
    input.imageSearch.requests.length === 0 &&
    input.imageSearch.scenes.length === 0
  ) {
    return;
  }
  const persisted = await input.persistDebug(
    input.episodeId,
    input.leaseOwner,
    {
      ...input.debugPayload,
      phase: input.phase,
      imageSearch: input.imageSearch,
    },
  );
  if (!persisted) {
    throw new Error('Visual search debug checkpoint lost its job lease');
  }
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
      ...(asset.slide ? { slide: asset.slide } : {}),
    })),
  };
}

function logPlannerProgress(
  logger: Pick<Console, 'info'>,
  runId: string,
  episodeId: string,
  progress: VisualAssetProgress,
  trace: VisualImageSearch,
): void {
  const { request, selection } = progress;
  logVisualProgress(logger, `visual:${progress.phase}`, {
    run: runId,
    episode: episodeId,
    sceneId: progress.sceneId,
    progress: `${progress.sceneIndex}/${progress.sceneCount}`,
    provider: progress.provider,
    requestKind: request?.kind,
    // The spent-against-budget counter, because a starved scene reads the same
    // as a mis-searched one until you know the episode ran out of requests.
    requests: request ? `${trace.requestCount}/${trace.budget.max}` : undefined,
    subjectKey: quotedField(
      request?.subjectKey ?? selection?.subjectKey ?? progress.subjectKey,
    ),
    searchIntent: quotedField(request?.query ?? progress.searchIntent),
    returned: request?.returned ?? progress.searchResultCount,
    viable: request?.viable ?? progress.candidateCount,
    searchError: request?.error ?? undefined,
    selection: selection?.selection,
    matchedSubjectKey: quotedField(selection?.matchedSubjectKey),
    providerRank: selection?.providerRank ?? undefined,
    fallbackReason: selection?.fallbackReason ?? undefined,
    assetId: progress.assetId,
    sourceHostname: progress.sourceHostname,
    reuseKind: progress.reuseKind,
    rejectedCandidateCount: progress.rejectedCandidateCount,
    rejectionSummary: progress.rejectionSummary,
    elapsedMs: progress.elapsedMs,
  });
}

/** Subject keys and queries carry spaces, so an unquoted value would merge into
 * the next `key=value` pair of the same line. */
function quotedField(value: string | null | undefined): string | undefined {
  return value === null || value === undefined ? undefined : `"${value}"`;
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

interface PreparedStoryboard {
  storyboard: StoryboardGenerationResult;
  searchIntentModel: string | null;
  subjectCatalog: VisualSubjectCatalog | null;
  sceneAssignments: VisualSceneSubjectAssignment[];
  /** Why this episode has no subject catalog, when enrichment degraded rather
   * than simply finding no named subject. */
  subjectCatalogFailure: string | null;
  resumePlan: VisualAssetPlan | null;
}

async function restorePreparedStoryboard(
  checkpoint: VisualCheckpoint,
  options: {
    workingDirectory: string;
    signal: AbortSignal;
    download: DownloadCheckpointImage;
  },
): Promise<PreparedStoryboard> {
  return {
    storyboard: restoreVisualStoryboard(checkpoint),
    searchIntentModel: checkpoint.searchIntentModel,
    subjectCatalog: checkpoint.subjectCatalog,
    sceneAssignments: [...checkpoint.sceneAssignments],
    subjectCatalogFailure: checkpoint.subjectCatalogFailure ?? null,
    resumePlan:
      checkpoint.scenes.length > 0
        ? await restoreVisualCheckpointPlan(checkpoint, options)
        : null,
  };
}

async function saveCheckpointOrThrow(
  context: ProcessEpisodeVideoVisualJobContext,
  checkpoint: VisualCheckpoint,
): Promise<void> {
  if (!(await context.saveCheckpoint(checkpoint))) {
    throw new Error('Visual checkpoint lost its job lease');
  }
}

function countBrandScenes(draft: {
  scenes: readonly { imageSearchIntent: readonly string[] }[];
}): number {
  return draft.scenes.filter(
    (scene) => podcastBrandVisualKind(scene.imageSearchIntent) !== null,
  ).length;
}

function logBranding(
  logger: Pick<Console, 'info'>,
  runId: string,
  episodeId: string,
  draft: {
    scenes: readonly {
      sceneId: string;
      imageSearchIntent: readonly string[];
    }[];
  },
): void {
  if (countBrandScenes(draft) === 0) {
    logVisualProgress(logger, 'visual:branding', {
      run: runId,
      episode: episodeId,
      status: 'skipped',
      reason: 'unpackaged-script',
    });
    return;
  }
  const outroScene = draft.scenes.find(
    (scene) => podcastBrandVisualKind(scene.imageSearchIntent) === 'outro',
  );
  if (outroScene) {
    logVisualProgress(logger, 'visual:branding', {
      run: runId,
      episode: episodeId,
      kind: 'zap-pilot-outro',
      sceneId: outroScene.sceneId,
    });
  }
}
