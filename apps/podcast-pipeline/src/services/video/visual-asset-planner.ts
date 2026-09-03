/* eslint-disable sonarjs/no-duplicate-string -- 'generated-slide' is a domain literal intentionally repeated in asset planning logic */
import { rm } from 'node:fs/promises';

import sharp from 'sharp';

import { errorMessage, toError } from '../../lib/errorMessage.js';
import type { ImageCandidate } from '../../types.js';
import {
  type AcquiredRemoteImage,
  acquireRemoteImage,
  type SupportedRemoteImageContentType,
} from './assets.js';
import {
  canSearch,
  createEpisodeImagePool,
  deriveSearchSubjects,
  type EpisodeImagePool,
  hasSearched,
  IMAGE_SEARCH_BUDGET,
  markAttempted,
  plannedPrimarySubjects,
  type PoolEntry,
  poolSkippedForBudget,
  poolSubject,
  poolSubjectKey,
  rankEntriesForScene,
  rankFallbackEntries,
  type SearchSubject,
  searchSubject,
  subjectEntries,
  subjectIsDirectlyAnchored,
  subjectRequestError,
  summarizePool,
} from './episode-image-pool.js';
import {
  defaultImageSearchProviders,
  type ImageSearchProvider,
} from './image-search-provider.js';
import {
  appendImageSearchProgress,
  countedRejections,
  createImageSearchTrace,
  formatImageSearchSummary,
  type ImageSearchRequestKind,
  type ImageSearchSummary,
  imageSearchSummaryRecord,
  type VisualImageSearch,
  type VisualImageSearchRequest,
  type VisualSceneFallbackReason,
  type VisualSceneSelection,
  type VisualSceneSelectionKind,
} from './image-search-trace.js';
import {
  candidateHostname,
  canonicalCandidateUrl,
  viableCandidates,
} from './search-candidate-ranking.js';

/**
 * How many photos of its own a subject may take from the pool. Scenes of the
 * same subject take turns over them, so this is the point at which hunting for
 * yet another distinct image stops being worth a download and rotation takes
 * over. Only images that subject's own search returned count against it: a
 * publisher image or one borrowed from another subject cost it no budget and
 * must not push it into repeating a photo it has already shown.
 */
const MAX_DISTINCT_SEARCHED_ASSETS_PER_SUBJECT = 6;
const PERCEPTUAL_HASH_DISTANCE_LIMIT = 6;
/**
 * The message string is the only channel out of the planner an alert reads, and
 * `publicTelegramErrorMessage` forwards its first line truncated at 497
 * characters. So every variable-length part of that line is capped, worst case
 * included, or the pool counts at the end fall off and the operator is left
 * with a starved scene and no numbers.
 */
const MAX_MESSAGE_REJECTION_CAUSES = 4;
const MAX_MESSAGE_PROVIDER_FAILURES = 2;
const MAX_MESSAGE_PROVIDER_FAILURE_LENGTH = 48;
export const MAX_GENERATED_SLIDE_RATIO = 0.25;

export interface VisualAssetScene {
  sceneId: string;
  imageSearchIntent: readonly string[];
  /** The proper nouns this scene names, validated verbatim against its own
   * sentences upstream. They earn a candidate a ranking bonus; they are not a
   * filter, because a news photo of a subject rarely repeats its name. */
  imageSearchEntities?: readonly string[];
  /** Whether the scene cites its subject itself or inherited it from the
   * section/episode. Only a direct citation is worth a targeted request of its
   * own. Absent means direct when the scene names entities, context otherwise. */
  searchAnchor?: 'direct' | 'context';
}

export type VisualImageProvider =
  | 'article'
  | 'brand'
  | 'generated-slide'
  | ImageSearchProvider['origin'];
export type VisualSelectionMode = 'strict' | 'resilient';
export type VisualReuseKind = 'non-consecutive' | 'consecutive';
export type VisualSceneExhaustedReason =
  | 'search-failure'
  | 'candidate-exhaustion'
  // Legacy: kept so stored payloads still parse. A scene that can only reuse
  // the preceding image now reuses it instead of failing the episode.
  | 'reuse-dead-end'
  | 'never-searched';

export class VisualSceneExhaustedError extends Error {
  constructor(
    readonly sceneId: string,
    readonly reason: VisualSceneExhaustedReason,
    message: string,
    readonly rejections: Record<string, number> = {},
    readonly search: Record<string, number> = {},
    readonly providerFailures: string[] = [],
  ) {
    super(message);
    this.name = 'VisualSceneExhaustedError';
  }
}

const PROVIDER_LICENSES = {
  article: 'unknown',
  brand: 'brand-generated',
  brave: 'unknown',
  'generated-slide': 'brand-generated',
} as const satisfies Record<VisualImageProvider, string>;

export interface GeneratedSlideMetadata {
  templateVersion: 'concept-card-v1';
  kicker: string;
  headline: string;
  points: string[];
  copySource: 'llm' | 'deterministic';
  model: string | null;
  reason: VisualSceneExhaustedReason;
  rejectionSummary: string | null;
  lead: boolean;
  costUsd: number | null;
}

export interface PlannedVisualImage {
  assetId: string;
  path: string;
  contentType: SupportedRemoteImageContentType;
  sha256: string;
  perceptualHash: string;
  width: number;
  height: number;
  originalImageUrl: string;
  sourcePageUrl: string;
  provider: VisualImageProvider;
  license: (typeof PROVIDER_LICENSES)[VisualImageProvider];
  photographer?: string;
  photographerUrl?: string;
  slide?: GeneratedSlideMetadata;
}

export interface PlannedVisualScene {
  sceneId: string;
  assetId: string;
}

export interface VisualAssetPlan {
  assets: PlannedVisualImage[];
  scenes: PlannedVisualScene[];
  /** Absent on a plan restored from a checkpoint, which predates the trace. */
  imageSearch?: VisualImageSearch;
}

export interface VisualAssetProgress {
  phase: 'search' | 'assets' | 'slide' | 'exhausted';
  sceneId: string;
  sceneIndex: number;
  sceneCount: number;
  candidateCount?: number;
  searchResultCount?: number;
  searchIntent?: string;
  subjectKey?: string;
  rejectedCandidateCount?: number;
  rejectionSummary?: string;
  provider?: VisualImageProvider | 'reuse';
  assetId?: string;
  sourceHostname?: string;
  reuseKind?: VisualReuseKind;
  /** Present on `search` events only, so a caller that never sees the returned
   * plan can still rebuild the trace of the attempt that failed. */
  request?: VisualImageSearchRequest;
  /** Present on every event that decides a scene, so each scene contributes
   * exactly one entry to the trace. */
  selection?: VisualSceneSelection;
  elapsedMs: number;
}

export interface GeneratedSlideRequest {
  assetId: string;
  scene: VisualAssetScene;
  title: string;
  evidence: { text: string; searchText?: string } | null;
  reason: VisualSceneExhaustedReason;
  rejectionSummary: string | null;
  lead: boolean;
  workingDirectory: string;
  signal?: AbortSignal;
}

interface VisualAssetPlannerDependencies {
  acquireImage: typeof acquireRemoteImage;
  searchProviders: readonly ImageSearchProvider[];
  fingerprintImage: typeof fingerprintImage;
  generateSlide?: (
    request: GeneratedSlideRequest,
  ) => Promise<PlannedVisualImage>;
}

export interface PlanVisualAssetsInput {
  scenes: readonly VisualAssetScene[];
  articleImages?: readonly ImageCandidate[];
  workingDirectory: string;
  resumePlan?: VisualAssetPlan;
  selectionMode?: VisualSelectionMode;
  signal?: AbortSignal;
  onProgress?: (event: VisualAssetProgress) => void;
  onSelection?: (event: {
    sceneId: string;
    sceneIndex: number;
    sceneCount: number;
    asset: PlannedVisualImage;
  }) => Promise<void>;
  slideFallback?: {
    title: string;
    sceneEvidence?: ReadonlyMap<string, { text: string; searchText?: string }>;
  };
  dependencies?: Partial<VisualAssetPlannerDependencies>;
}

interface VisualAssetPlannerState {
  input: PlanVisualAssetsInput;
  dependencies: VisualAssetPlannerDependencies;
  articleImages: ImageCandidate[];
  articleCursor: number;
  attemptedUrls: Set<string>;
  assets: PlannedVisualImage[];
  scenes: PlannedVisualScene[];
  /** Keyed by `poolSubjectKey`, so scenes that name nothing take turns over
   * their own images too instead of all landing on the same one. Every non-slide
   * image a subject's scenes showed lands here, which is what reuse wants. */
  subjectAssetIds: Map<string, string[]>;
  /** Only the images a subject's OWN searches returned, keyed by
   * `poolSubjectKey`. That is what the rotation budget bounds, and
   * `subjectAssetIds` cannot answer it: an article image or a photo borrowed
   * from another subject's entries is filed there too, so measuring saturation
   * from it declared a subject spent after a single image of its own. */
  subjectSearchedCounts: Map<string, number>;
  /** Pool draws keyed by the subject whose request paid for the entry, so a
   * donor that has already lent images out ranks below a fresher one. */
  poolDrawsBySubject: Map<string, number>;
  /** Built lazily: an episode whose article images clothe every scene must
   * cost nothing at Brave. */
  pool: EpisodeImagePool | null;
  trace: VisualImageSearch;
  throwOnProviderFailure: boolean;
  allowGeneratedSlides: boolean;
}

/** How a scene got its image, before the rejection counts are folded in. */
interface SelectionOrigin {
  selection: VisualSceneSelectionKind;
  matchedSubjectKey: string | null;
  sourceQuery: string | null;
  providerRank: number | null;
  fallbackReason: VisualSceneFallbackReason | null;
}

interface SelectedVisualImage {
  asset: PlannedVisualImage;
  provider: VisualAssetProgress['provider'];
  rejections: CandidateRejections;
  reuseKind?: VisualReuseKind;
  origin: SelectionOrigin;
}

/** One scene's walk down the ladder. The rejection counter is shared by every
 * rung, so the error a starved scene throws names everything that was tried. */
interface SceneLadder {
  state: VisualAssetPlannerState;
  scene: VisualAssetScene;
  sceneIndex: number;
  subjectKey: string;
  rejections: CandidateRejections;
}

interface CandidateRejections {
  total: number;
  causes: Map<string, number>;
}

function resolvePlannerDependencies(
  overrides: Partial<VisualAssetPlannerDependencies> | undefined,
): VisualAssetPlannerDependencies {
  return {
    acquireImage: overrides?.acquireImage ?? acquireRemoteImage,
    fingerprintImage: overrides?.fingerprintImage ?? fingerprintImage,
    ...(overrides?.generateSlide
      ? { generateSlide: overrides.generateSlide }
      : {}),
    // Resolved per invocation so API-key env changes take effect without a
    // module reload, and only when the caller brought no chain of its own —
    // the default one fails closed on a missing Brave key.
    searchProviders:
      overrides?.searchProviders ?? defaultImageSearchProviders(),
  };
}

export async function planVisualAssets(
  input: PlanVisualAssetsInput,
): Promise<VisualAssetPlan> {
  if (input.scenes.length === 0) {
    throw new Error('Visual asset planning requires at least one scene');
  }

  const mode = input.selectionMode ?? 'strict';
  const state: VisualAssetPlannerState = {
    input,
    dependencies: resolvePlannerDependencies(input.dependencies),
    articleImages: viableCandidates(input.articleImages ?? [], [
      'openGraph',
      'article',
      'figure',
    ]),
    articleCursor: 0,
    // Canonical, because that is the form every later comparison uses: seeding
    // the raw URLs let a resumed scene re-download an image it already owns.
    attemptedUrls: new Set(
      (input.resumePlan?.assets ?? [])
        .map((asset) => canonicalCandidateUrl(asset.originalImageUrl))
        .filter((url): url is string => url !== null),
    ),
    assets: [...(input.resumePlan?.assets ?? [])],
    scenes: [...(input.resumePlan?.scenes ?? [])],
    subjectAssetIds: new Map(),
    subjectSearchedCounts: new Map(),
    poolDrawsBySubject: new Map(),
    pool: null,
    trace: createImageSearchTrace(
      IMAGE_SEARCH_BUDGET,
      input.resumePlan?.scenes.length ?? 0,
    ),
    throwOnProviderFailure: mode === 'strict',
    allowGeneratedSlides: mode === 'resilient',
  };

  for (const resumedScene of state.scenes) {
    const scene = input.scenes.find(
      (candidate) => candidate.sceneId === resumedScene.sceneId,
    );
    const asset = state.assets.find(
      (candidate) => candidate.assetId === resumedScene.assetId,
    );
    if (scene && asset && asset.provider !== 'generated-slide') {
      rememberSubjectAsset(state, scene, asset.assetId);
      // A checkpoint records no ladder rung, so the provider is the only
      // evidence left of where a resumed image came from. A searched photo
      // spent this subject's rotation budget on the earlier attempt and still
      // does; an article image never did.
      if (asset.provider === 'brave') {
        incrementCount(state.subjectSearchedCounts, poolSubjectKey(scene));
      }
    }
  }

  const resumedSceneIds = new Set(state.scenes.map((scene) => scene.sceneId));
  for (const [sceneIndex, scene] of input.scenes.entries()) {
    input.signal?.throwIfAborted();
    if (resumedSceneIds.has(scene.sceneId)) continue;
    const startedAt = Date.now();
    const selected = await selectSceneAsset(state, scene, sceneIndex);

    state.scenes.push({
      sceneId: scene.sceneId,
      assetId: selected.asset.assetId,
    });
    if (selected.asset.provider !== 'generated-slide') {
      rememberSubjectAsset(state, scene, selected.asset.assetId);
    }
    await input.onSelection?.({
      sceneId: scene.sceneId,
      sceneIndex: sceneIndex + 1,
      sceneCount: input.scenes.length,
      asset: selected.asset,
    });
    reportSceneSelection(state, scene, sceneIndex, selected, startedAt);
  }

  state.trace.budgetExhausted = budgetExhausted(state);
  return {
    assets: state.assets,
    scenes: state.scenes,
    imageSearch: state.trace,
  };
}

/**
 * Exhausted budget is reported as a quality signal rather than a failure, so it
 * has to be readable from the plan: either a search was actually refused, or
 * the episode spent everything it was allowed.
 */
function budgetExhausted(state: VisualAssetPlannerState): boolean {
  const pool = state.pool;
  if (!pool) return false;
  return (
    poolSkippedForBudget(pool) > 0 ||
    state.trace.requestCount >= IMAGE_SEARCH_BUDGET.max
  );
}

function reportSceneSelection(
  state: VisualAssetPlannerState,
  scene: VisualAssetScene,
  sceneIndex: number,
  selected: SelectedVisualImage,
  startedAt: number,
): void {
  const sourceHostname = candidateHostname(selected.asset.sourcePageUrl);
  emitProgress(state, {
    phase: 'assets',
    sceneId: scene.sceneId,
    sceneIndex: sceneIndex + 1,
    sceneCount: state.input.scenes.length,
    provider: selected.provider,
    assetId: selected.asset.assetId,
    subjectKey: poolSubjectKey(scene),
    ...(sourceHostname ? { sourceHostname } : {}),
    ...(selected.reuseKind ? { reuseKind: selected.reuseKind } : {}),
    ...(selected.rejections.total > 0
      ? {
          rejectedCandidateCount: selected.rejections.total,
          rejectionSummary: summarizeCandidateRejections(selected.rejections),
        }
      : {}),
    selection: selectionRecord(scene, selected.origin, selected.rejections),
    elapsedMs: Date.now() - startedAt,
  });
}

/** The planner keeps its own trace through the same fold the processor uses, so
 * a trace rebuilt from progress events cannot drift from the returned one. */
function emitProgress(
  state: VisualAssetPlannerState,
  event: VisualAssetProgress,
): void {
  appendImageSearchProgress(state.trace, event);
  state.input.onProgress?.(event);
}

async function selectSceneAsset(
  state: VisualAssetPlannerState,
  scene: VisualAssetScene,
  sceneIndex: number,
): Promise<SelectedVisualImage> {
  const ladder: SceneLadder = {
    state,
    scene,
    sceneIndex,
    subjectKey: poolSubjectKey(scene),
    rejections: createCandidateRejections(),
  };

  let exhaustion: VisualSceneExhaustedError;
  try {
    const selected = await selectImageForScene(ladder);
    if (selected) return selected;
    exhaustion = candidateExhaustionFailure(ladder);
  } catch (error) {
    if (
      state.input.signal?.aborted ||
      !(error instanceof VisualSceneExhaustedError)
    ) {
      throw error;
    }
    exhaustion = error;
  }

  return generatedSlideOrThrow(ladder, exhaustion);
}

/**
 * The ladder, in the order a scene walks it. Every rung below the article image
 * degrades quality rather than failing: an imperfect photo is worth more than a
 * missing video, so the only way out of here without an asset is a broken plan.
 */
async function selectImageForScene(
  ladder: SceneLadder,
): Promise<SelectedVisualImage | null> {
  const articleImage = await tryArticleImage(ladder);
  if (articleImage) return articleImage;

  const saturatedReuse = trySaturatedSubjectReuse(ladder);
  if (saturatedReuse) return saturatedReuse;

  const pool = await ensureEpisodePool(ladder);
  return (
    (await trySubjectPool(ladder, pool, 'pool')) ??
    (await tryTargetedSearch(ladder, pool)) ??
    (await tryPoolFallback(ladder, pool)) ??
    tryEpisodeReuse(ladder)
  );
}

async function tryArticleImage(
  ladder: SceneLadder,
): Promise<SelectedVisualImage | null> {
  const { state, scene, sceneIndex, rejections } = ladder;
  // The publisher's own images are valuable source material, but the lead
  // visual must be independently sourced from the original headline subject.
  // Do not consume the first article image here; scene 2 can still use it.
  const isLeadNamedScene =
    sceneIndex === 0 && (scene.imageSearchEntities?.length ?? 0) > 0;
  const asset = isLeadNamedScene
    ? null
    : await acquireNextArticleImage(state, scene, rejections);
  if (!asset) return null;
  return {
    asset,
    provider: 'article',
    rejections,
    origin: plainOrigin('article'),
  };
}

function trySaturatedSubjectReuse(
  ladder: SceneLadder,
): SelectedVisualImage | null {
  const searched =
    ladder.state.subjectSearchedCounts.get(ladder.subjectKey) ?? 0;
  if (searched < MAX_DISTINCT_SEARCHED_ASSETS_PER_SUBJECT) return null;
  const reuse = reusableAsset(ladder.state, ladder.scene, {
    sameSubjectOnly: true,
  });
  return reuse ? reuseSelection(ladder, reuse, null) : null;
}

async function trySubjectPool(
  ladder: SceneLadder,
  pool: EpisodeImagePool,
  selection: VisualSceneSelectionKind,
): Promise<SelectedVisualImage | null> {
  const entries = rankEntriesForScene(
    subjectEntries(pool, ladder.subjectKey),
    ladder.scene,
    ladder.state.assets,
  );
  return acquireFromPool(ladder, pool, entries, {
    selection,
    fallbackReason: null,
  });
}

/**
 * One extra request for a scene that cites its subject itself and found the
 * pool empty for it. A scene that only inherited its subject never spends one:
 * it has no identity of its own to insist on.
 */
async function tryTargetedSearch(
  ladder: SceneLadder,
  pool: EpisodeImagePool,
): Promise<SelectedVisualImage | null> {
  const { scene, subjectKey } = ladder;
  if (hasSearched(pool, subjectKey)) return null;
  if (!subjectIsDirectlyAnchored(scene)) return null;
  if (!canSearch(pool, 'targeted')) return null;
  const subject = poolSubject(pool, subjectKey);
  if (!subject) return null;
  await runSubjectSearch(ladder, pool, subject, 'targeted', scene.sceneId);
  return trySubjectPool(ladder, pool, 'targeted');
}

async function tryPoolFallback(
  ladder: SceneLadder,
  pool: EpisodeImagePool,
): Promise<SelectedVisualImage | null> {
  const { scene, subjectKey, rejections, state } = ladder;
  const providerError = subjectRequestError(pool, subjectKey);
  if (providerError !== null) {
    recordSearchFailures(rejections, [new Error(providerError)]);
  }
  const entries = rankFallbackEntries(
    pool,
    scene,
    state.assets,
    state.poolDrawsBySubject,
  );
  return acquireFromPool(ladder, pool, entries, {
    selection: 'pool-fallback',
    fallbackReason: poolFallbackReason(pool, scene, subjectKey, providerError),
  });
}

function tryEpisodeReuse(ladder: SceneLadder): SelectedVisualImage | null {
  const reuse = reusableAsset(ladder.state, ladder.scene, {
    sameSubjectOnly: false,
  });
  return reuse ? reuseSelection(ladder, reuse, 'pool-exhausted') : null;
}

/**
 * Why this scene is looking outside its own subject. The four answers are
 * different operational problems -- a broken key, a spent budget, a subject
 * nobody paid for, and a subject whose photos are simply used up -- and only
 * `imageSearch.scenes[].fallbackReason` tells them apart after the fact.
 */
function poolFallbackReason(
  pool: EpisodeImagePool,
  scene: VisualAssetScene,
  subjectKey: string,
  providerError: string | null,
): VisualSceneFallbackReason {
  if (providerError !== null) return 'provider-failure';
  if (hasSearched(pool, subjectKey)) return 'subject-entries-exhausted';
  return subjectIsDirectlyAnchored(scene) && !canSearch(pool, 'targeted')
    ? 'budget-exhausted'
    : 'subject-not-searched';
}

async function acquireFromPool(
  ladder: SceneLadder,
  pool: EpisodeImagePool,
  entries: readonly PoolEntry[],
  origin: {
    selection: VisualSceneSelectionKind;
    fallbackReason: VisualSceneFallbackReason | null;
  },
): Promise<SelectedVisualImage | null> {
  const { state, scene, sceneIndex, rejections } = ladder;
  for (const entry of entries) {
    state.input.signal?.throwIfAborted();
    if (sceneIndex === 0 && isPublisherArticleCandidate(state, entry.candidate))
      continue;
    // Claimed before the download rather than after it: thirty scenes walking
    // a hundred shared entries would otherwise re-attempt every one of them and
    // manufacture thousands of duplicate-url rejections.
    markAttempted(pool, entry);
    const asset = await tryAcquireUniqueImage({
      candidate: entry.candidate,
      provider: 'brave',
      scene,
      input: state.input,
      dependencies: state.dependencies,
      assets: state.assets,
      attemptedUrls: state.attemptedUrls,
      rejections,
    });
    if (!asset) continue;
    incrementCount(state.poolDrawsBySubject, entry.requestSubjectKey);
    // The rung, not `entry.requestSubjectKey`, is what makes an entry this
    // subject's own: two subjects sharing a normalized query read entries
    // stamped with whichever of them paid, and those are still their own.
    if (origin.selection === 'pool' || origin.selection === 'targeted') {
      incrementCount(state.subjectSearchedCounts, ladder.subjectKey);
    }
    return {
      asset,
      provider: asset.provider,
      rejections,
      origin: {
        selection: origin.selection,
        matchedSubjectKey: entry.requestSubjectKey,
        sourceQuery: entry.requestQuery,
        providerRank: entry.providerRank,
        fallbackReason: origin.fallbackReason,
      },
    };
  }
  return null;
}

/**
 * Builds the episode pool on the first scene that actually needs a searched
 * image, and pays for the primary pass there. Subjects come from the scenes
 * still to be planned, so a resumed job does not spend requests on the scenes
 * its checkpoint already covers.
 */
async function ensureEpisodePool(
  ladder: SceneLadder,
): Promise<EpisodeImagePool> {
  const { state } = ladder;
  const existing = state.pool;
  if (existing) return existing;

  const subjects = deriveSearchSubjects(
    unplannedScenes(state, ladder.sceneIndex),
  );
  const pool = createEpisodeImagePool(subjects);
  state.pool = pool;
  state.trace.primarySubjects = plannedPrimarySubjects(subjects);
  for (const planned of state.trace.primarySubjects) {
    const subject = poolSubject(pool, planned.subjectKey);
    if (subject) await runSubjectSearch(ladder, pool, subject, 'primary', null);
  }
  return pool;
}

function unplannedScenes(
  state: VisualAssetPlannerState,
  sceneIndex: number,
): VisualAssetScene[] {
  const planned = new Set(state.scenes.map((scene) => scene.sceneId));
  return state.input.scenes
    .slice(sceneIndex)
    .filter((scene) => !planned.has(scene.sceneId));
}

async function runSubjectSearch(
  ladder: SceneLadder,
  pool: EpisodeImagePool,
  subject: SearchSubject,
  kind: ImageSearchRequestKind,
  sceneId: string | null,
): Promise<void> {
  const { state, scene, sceneIndex } = ladder;
  const startedAt = Date.now();
  const request = await searchOrFail(ladder, pool, subject, kind, sceneId);
  if (!request) return;
  emitProgress(state, {
    phase: 'search',
    sceneId: scene.sceneId,
    sceneIndex: sceneIndex + 1,
    sceneCount: state.input.scenes.length,
    candidateCount: request.viable,
    searchResultCount: request.returned,
    searchIntent: request.query,
    subjectKey: request.subjectKey,
    provider: 'brave',
    request,
    elapsedMs: Date.now() - startedAt,
  });
}

async function searchOrFail(
  ladder: SceneLadder,
  pool: EpisodeImagePool,
  subject: SearchSubject,
  kind: ImageSearchRequestKind,
  sceneId: string | null,
): Promise<VisualImageSearchRequest | null> {
  const { state } = ladder;
  try {
    return await searchSubject(pool, subject, kind, {
      provider: state.dependencies.searchProviders[0] ?? null,
      sceneId,
      ...(state.input.signal ? { signal: state.input.signal } : {}),
      attemptedUrls: state.attemptedUrls,
      throwOnProviderFailure: state.throwOnProviderFailure,
    });
  } catch (error) {
    // Only strict mode asked for a provider failure to be thrown, so only
    // strict mode has one to convert into a scene-level diagnosis.
    if (!state.throwOnProviderFailure) throw error;
    if (isAbort(error, state.input.signal)) throw error;
    throw visualSearchFailure(ladder, pool, [toError(error)]);
  }
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  return error instanceof Error && error.name === 'AbortError';
}

function selectionRecord(
  scene: VisualAssetScene,
  origin: SelectionOrigin,
  rejections: CandidateRejections,
): VisualSceneSelection {
  return {
    sceneId: scene.sceneId,
    subjectKey: poolSubjectKey(scene),
    matchedSubjectKey: origin.matchedSubjectKey,
    selection: origin.selection,
    sourceQuery: origin.sourceQuery,
    providerRank: origin.providerRank,
    fallbackReason: origin.fallbackReason,
    rejections: countedRejections(candidateRejectionRecord(rejections)),
  };
}

function plainOrigin(selection: VisualSceneSelectionKind): SelectionOrigin {
  return {
    selection,
    matchedSubjectKey: null,
    sourceQuery: null,
    providerRank: null,
    fallbackReason: null,
  };
}

function reuseSelection(
  ladder: SceneLadder,
  reuse: { asset: PlannedVisualImage; reuseKind: VisualReuseKind },
  fallbackReason: VisualSceneFallbackReason | null,
): SelectedVisualImage {
  return {
    asset: reuse.asset,
    provider: 'reuse',
    reuseKind: reuse.reuseKind,
    rejections: ladder.rejections,
    origin: { ...plainOrigin('reuse'), fallbackReason },
  };
}

function nextAssetId(assets: readonly PlannedVisualImage[]): string {
  const max = assets.reduce((current, asset) => {
    const match = /^image-(\d+)$/u.exec(asset.assetId);
    return match ? Math.max(current, Number.parseInt(match[1]!, 10)) : current;
  }, 0);
  return `image-${String(max + 1).padStart(2, '0')}`;
}

function rememberSubjectAsset(
  state: VisualAssetPlannerState,
  scene: VisualAssetScene,
  assetId: string,
): void {
  const key = poolSubjectKey(scene);
  const assetIds = state.subjectAssetIds.get(key) ?? [];
  if (!assetIds.includes(assetId)) assetIds.push(assetId);
  state.subjectAssetIds.set(key, assetIds);
}

function incrementCount(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/**
 * Rotation, not novelty. The least-used image of this subject comes first, the
 * immediately preceding scene's image is skipped while any alternative exists,
 * and only a single remaining option can produce a consecutive repeat. Concept
 * cards are excluded: repeating one is the one reuse worth nothing.
 */
function reusableAsset(
  state: VisualAssetPlannerState,
  scene: VisualAssetScene,
  options: { sameSubjectOnly: boolean },
): { asset: PlannedVisualImage; reuseKind: VisualReuseKind } | null {
  const candidates = reuseCandidates(state, scene, options.sameSubjectOnly);
  if (candidates.length === 0) return null;

  const previousAssetId = state.scenes.at(-1)?.assetId;
  const useCount = new Map<string, number>();
  for (const selection of state.scenes) {
    useCount.set(selection.assetId, (useCount.get(selection.assetId) ?? 0) + 1);
  }
  const sorted = [...candidates].sort(
    (left, right) =>
      (useCount.get(left.assetId) ?? 0) - (useCount.get(right.assetId) ?? 0),
  );
  const asset =
    sorted.find((candidate) => candidate.assetId !== previousAssetId) ??
    sorted[0]!;
  return {
    asset,
    reuseKind:
      asset.assetId === previousAssetId ? 'consecutive' : 'non-consecutive',
  };
}

function reuseCandidates(
  state: VisualAssetPlannerState,
  scene: VisualAssetScene,
  sameSubjectOnly: boolean,
): PlannedVisualImage[] {
  const assetsById = new Map(
    state.assets.map((asset) => [asset.assetId, asset] as const),
  );
  const candidates: PlannedVisualImage[] = [];
  const seen = new Set<string>();
  const consider = (asset: PlannedVisualImage | undefined): void => {
    if (!asset || asset.provider === 'generated-slide') return;
    if (seen.has(asset.assetId)) return;
    seen.add(asset.assetId);
    candidates.push(asset);
  };

  const ownAssetIds = state.subjectAssetIds.get(poolSubjectKey(scene)) ?? [];
  for (const assetId of ownAssetIds) consider(assetsById.get(assetId));
  if (!sameSubjectOnly) for (const asset of state.assets) consider(asset);
  return candidates;
}

function recordSearchFailures(
  rejections: CandidateRejections,
  failures: readonly Error[],
): void {
  if (failures.length === 0) return;
  const cause = 'search-provider-failure';
  rejections.total += failures.length;
  rejections.causes.set(
    cause,
    (rejections.causes.get(cause) ?? 0) + failures.length,
  );
}

async function acquireNextArticleImage(
  state: VisualAssetPlannerState,
  scene: VisualAssetScene,
  rejections: CandidateRejections,
): Promise<PlannedVisualImage | null> {
  while (state.articleCursor < state.articleImages.length) {
    const candidate = state.articleImages[state.articleCursor++]!;
    const acquired = await tryAcquireUniqueImage({
      candidate,
      provider: 'article',
      scene,
      input: state.input,
      dependencies: state.dependencies,
      assets: state.assets,
      attemptedUrls: state.attemptedUrls,
      rejections,
    });
    if (acquired) return acquired;
  }
  return null;
}

function isPublisherArticleCandidate(
  state: VisualAssetPlannerState,
  candidate: ImageCandidate,
): boolean {
  const sourceUrl = state.articleImages[0]?.sourceUrl;
  if (!sourceUrl) return false;
  try {
    const article = new URL(sourceUrl);
    const candidateSource = new URL(candidate.sourceUrl);
    return (
      article.hostname.toLowerCase() ===
        candidateSource.hostname.toLowerCase() &&
      article.pathname.replace(/\/$/u, '') ===
        candidateSource.pathname.replace(/\/$/u, '')
    );
  } catch {
    return false;
  }
}

async function generatedSlideOrThrow(
  ladder: SceneLadder,
  exhaustion: VisualSceneExhaustedError,
): Promise<SelectedVisualImage> {
  const { state, scene, sceneIndex, rejections } = ladder;
  const generateSlide = state.dependencies.generateSlide;
  if (
    !state.allowGeneratedSlides ||
    !state.input.slideFallback ||
    !generateSlide
  ) {
    throw reportSceneExhaustion(ladder, exhaustion);
  }

  const generatedCount = state.assets.filter(
    (asset) => asset.provider === 'generated-slide',
  ).length;
  const cap = Math.max(
    1,
    Math.ceil(state.input.scenes.length * MAX_GENERATED_SLIDE_RATIO),
  );
  if (generatedCount >= cap) {
    throw reportSceneExhaustion(
      ladder,
      new VisualSceneExhaustedError(
        exhaustion.sceneId,
        exhaustion.reason,
        `${exhaustion.message} [generatedSlides=${generatedCount}, cap=${cap}]`,
        exhaustion.rejections,
        exhaustion.search,
        exhaustion.providerFailures,
      ),
    );
  }

  const asset = await generateSlide({
    assetId: nextAssetId(state.assets),
    scene,
    title: state.input.slideFallback.title,
    evidence:
      state.input.slideFallback.sceneEvidence?.get(scene.sceneId) ?? null,
    reason: exhaustion.reason,
    rejectionSummary: formatRejectionRecord(exhaustion.rejections),
    lead: sceneIndex === 0,
    workingDirectory: state.input.workingDirectory,
    ...(state.input.signal ? { signal: state.input.signal } : {}),
  });
  state.assets.push(asset);

  const origin = plainOrigin('generated-slide');
  emitProgress(state, {
    phase: 'slide',
    sceneId: scene.sceneId,
    sceneIndex: sceneIndex + 1,
    sceneCount: state.input.scenes.length,
    provider: 'generated-slide',
    assetId: asset.assetId,
    ...(asset.slide?.rejectionSummary
      ? { rejectionSummary: asset.slide.rejectionSummary }
      : {}),
    selection: selectionRecord(scene, origin, rejections),
    elapsedMs: 0,
  });
  return { asset, provider: 'generated-slide', rejections, origin };
}

/** Records the terminal decision before the throw, so a scene that fails still
 * contributes its entry to the trace the processor rebuilds. */
function reportSceneExhaustion(
  ladder: SceneLadder,
  exhaustion: VisualSceneExhaustedError,
): VisualSceneExhaustedError {
  const { state, scene, sceneIndex, rejections } = ladder;
  emitProgress(state, {
    phase: 'exhausted',
    sceneId: scene.sceneId,
    sceneIndex: sceneIndex + 1,
    sceneCount: state.input.scenes.length,
    ...(rejections.total > 0
      ? {
          rejectedCandidateCount: rejections.total,
          rejectionSummary: summarizeCandidateRejections(rejections),
        }
      : {}),
    selection: selectionRecord(scene, plainOrigin('exhausted'), rejections),
    elapsedMs: 0,
  });
  return exhaustion;
}

function visualSearchFailure(
  ladder: SceneLadder,
  pool: EpisodeImagePool | null,
  failures: readonly Error[],
): VisualSceneExhaustedError {
  const messages = [...new Set(failures.map((failure) => failure.message))];
  const summary = imageSearchSummary(pool);
  return new VisualSceneExhaustedError(
    ladder.scene.sceneId,
    'search-failure',
    `Visual image search failed for scene ${ladder.scene.sceneId}: ${messages.join('; ')}${formatCandidateRejectionDetails(ladder.rejections)} ${formatImageSearchSummary(summary)}`,
    candidateRejectionRecord(ladder.rejections),
    imageSearchSummaryRecord(summary),
    messages,
  );
}

function candidateExhaustionFailure(
  ladder: SceneLadder,
): VisualSceneExhaustedError {
  const { state, scene, rejections } = ladder;
  const summary = imageSearchSummary(state.pool);
  const failures = poolProviderFailures(state.pool);
  return new VisualSceneExhaustedError(
    scene.sceneId,
    exhaustionReason(state.pool, summary),
    `Visual scene ${scene.sceneId} has no usable image${formatCandidateRejectionDetails(rejections)}${formatProviderFailureDetails(failures)} ${formatImageSearchSummary(summary)}`,
    candidateRejectionRecord(rejections),
    imageSearchSummaryRecord(summary),
    failures,
  );
}

/** The distinct provider errors the episode's requests recorded. A starved
 * scene in resilient mode never threw one of these itself -- the pool absorbed
 * them so the episode could still render -- so this is where an expired key or
 * a rate limit becomes visible to whoever reads the alert. */
function poolProviderFailures(pool: EpisodeImagePool | null): string[] {
  if (!pool) return [];
  return [
    ...new Set(
      pool.requests
        .map((request) => request.error)
        .filter((error): error is string => error !== null),
    ),
  ];
}

function formatProviderFailureDetails(failures: readonly string[]): string {
  if (failures.length === 0) return '';
  const listed = failures
    .slice(0, MAX_MESSAGE_PROVIDER_FAILURES)
    .map((failure) =>
      boundedSingleLine(failure, MAX_MESSAGE_PROVIDER_FAILURE_LENGTH),
    );
  const hidden = failures.length - listed.length;
  const more = hidden > 0 ? `; +${hidden} more` : '';
  return ` [searchErrors: ${listed.join('; ')}${more}]`;
}

/** Whitespace is collapsed before the cap because a provider that answers with
 * a multi-line body would otherwise end the first line early and take every
 * count after it with it. */
function boundedSingleLine(value: string, limit: number): string {
  const collapsed = value.replace(/\s+/gu, ' ').trim();
  return collapsed.length > limit
    ? `${collapsed.slice(0, limit - 3)}...`
    : collapsed;
}

/**
 * Three different stories end at an unusable scene, and the reason is what
 * decides whether to look at the provider, the storyboard, or the images: no
 * request was ever made, every request errored, or the episode had images and
 * rejected all of them.
 */
function exhaustionReason(
  pool: EpisodeImagePool | null,
  summary: ImageSearchSummary,
): VisualSceneExhaustedReason {
  if (!pool || summary.requests === 0) return 'never-searched';
  if (
    summary.pool === 0 &&
    pool.requests.length > 0 &&
    pool.requests.every((request) => request.error !== null)
  ) {
    return 'search-failure';
  }
  return 'candidate-exhaustion';
}

/** The counts that explain a starved scene, taken from the pool the episode
 * actually built. Spent requests rather than recorded ones: a request that
 * threw before it could be recorded was still paid for. */
function imageSearchSummary(pool: EpisodeImagePool | null): ImageSearchSummary {
  if (!pool) {
    return {
      pool: 0,
      attempted: 0,
      requests: 0,
      requestBudget: IMAGE_SEARCH_BUDGET.max,
      returned: 0,
      viable: 0,
    };
  }
  const summary = summarizePool(pool);
  return {
    pool: summary.poolSize,
    attempted: summary.attempted,
    requests: pool.requestCounts.primary + pool.requestCounts.targeted,
    requestBudget: IMAGE_SEARCH_BUDGET.max,
    returned: summary.returned,
    viable: summary.viable,
    drops: summary.drops,
  };
}

async function tryAcquireUniqueImage(input: {
  candidate: ImageCandidate;
  provider: PlannedVisualImage['provider'];
  scene: VisualAssetScene;
  input: PlanVisualAssetsInput;
  dependencies: VisualAssetPlannerDependencies;
  assets: PlannedVisualImage[];
  attemptedUrls: Set<string>;
  rejections: CandidateRejections;
}): Promise<PlannedVisualImage | null> {
  const canonicalUrl = canonicalCandidateUrl(input.candidate.imageUrl);
  if (!canonicalUrl) {
    recordCandidateRejection(input.rejections, 'invalid-url');
    return null;
  }
  if (input.attemptedUrls.has(canonicalUrl)) {
    recordCandidateRejection(input.rejections, 'duplicate-url');
    return null;
  }
  input.attemptedUrls.add(canonicalUrl);

  let acquired: AcquiredRemoteImage | null;
  try {
    acquired = await input.dependencies.acquireImage(input.candidate.imageUrl, {
      workingDirectory: input.input.workingDirectory,
      filename: `${input.scene.sceneId}-${String(
        input.attemptedUrls.size,
      ).padStart(3, '0')}`,
      layout: 'fullBleed',
      ...(input.input.signal ? { signal: input.input.signal } : {}),
    });
  } catch (error) {
    if (input.input.signal?.aborted) throw error;
    recordCandidateRejection(
      input.rejections,
      safeCandidateRejectionCause(error),
    );
    return null;
  }
  if (!acquired) {
    recordCandidateRejection(input.rejections, 'empty-acquisition');
    return null;
  }

  const perceptualHash = await input.dependencies.fingerprintImage(
    acquired.path,
  );
  const duplicate = input.assets.some(
    (asset) =>
      asset.sha256 === acquired.sha256 ||
      perceptualHashDistance(asset.perceptualHash, perceptualHash) <=
        PERCEPTUAL_HASH_DISTANCE_LIMIT,
  );
  if (duplicate) {
    await rm(acquired.path, { force: true });
    recordCandidateRejection(input.rejections, 'duplicate-image');
    return null;
  }

  const planned = toPlannedImage(
    acquired,
    input.candidate,
    input.provider,
    nextAssetId(input.assets),
    perceptualHash,
  );
  input.assets.push(planned);
  return planned;
}

function createCandidateRejections(): CandidateRejections {
  return { total: 0, causes: new Map<string, number>() };
}

function recordCandidateRejection(
  rejections: CandidateRejections,
  cause: string,
): void {
  rejections.total += 1;
  incrementCount(rejections.causes, cause);
}

function summarizeCandidateRejections(
  rejections: CandidateRejections,
  limit = Number.POSITIVE_INFINITY,
): string {
  const causes = [...rejections.causes.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const listed = causes.slice(0, limit);
  const hidden = causes.length - listed.length;
  return [
    ...listed.map(([cause, count]) => `${cause}:${count}`),
    ...(hidden > 0 ? [`+${hidden} more`] : []),
  ].join(',');
}

function formatCandidateRejectionDetails(
  rejections: CandidateRejections,
): string {
  return rejections.total === 0
    ? ''
    : ` after rejecting ${rejections.total} candidate(s) (${summarizeCandidateRejections(rejections, MAX_MESSAGE_REJECTION_CAUSES)})`;
}

function candidateRejectionRecord(
  rejections: CandidateRejections,
): Record<string, number> {
  return Object.fromEntries(rejections.causes);
}

function formatRejectionRecord(
  rejections: Record<string, number>,
): string | null {
  const entries = Object.entries(rejections);
  if (entries.length === 0) return null;
  return entries.map(([cause, count]) => `${cause}:${count}`).join(',');
}

function safeCandidateRejectionCause(error: unknown): string {
  const message = errorMessage(error);
  const httpStatus = /\bHTTP\s+(\d{3})\b/i.exec(message)?.[1];
  if (httpStatus) return `http-${httpStatus}`;
  if (/timed?\s*out|timeout/i.test(message)) return 'timeout';
  if (
    /long edge|short edge|dimensions? (?:could not|is \d+px)/i.test(message)
  ) {
    return 'dimensions-too-small';
  }
  if (/unsupported raster|not an image|content type/i.test(message)) {
    return 'unsupported-format';
  }
  if (/animated|multi-page/i.test(message)) return 'animated-image';
  if (/25 MiB|pixel-dimension|download limit/i.test(message)) {
    return 'size-limit';
  }
  if (
    /private|reserved|must use HTTPS|credentials|pre-validated/i.test(message)
  ) {
    return 'safety-policy';
  }
  if (/redirect/i.test(message)) return 'redirect';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|\bDNS\b/i.test(message)) return 'dns';
  if (/ECONN|socket|network|fetch failed|certificate|\bTLS\b/i.test(message)) {
    return 'network';
  }
  if (/decode|corrupt|invalid image|sharp/i.test(message)) return 'decode';
  return 'other';
}

function toPlannedImage(
  acquired: AcquiredRemoteImage,
  candidate: ImageCandidate,
  provider: PlannedVisualImage['provider'],
  assetId: string,
  perceptualHash: string,
): PlannedVisualImage {
  return {
    assetId,
    path: acquired.path,
    contentType: acquired.contentType,
    sha256: acquired.sha256,
    perceptualHash,
    width: acquired.width,
    height: acquired.height,
    originalImageUrl: candidate.imageUrl,
    sourcePageUrl: candidate.sourceUrl,
    provider,
    license: PROVIDER_LICENSES[provider],
    ...(candidate.photographer ? { photographer: candidate.photographer } : {}),
    ...(candidate.photographerUrl
      ? { photographerUrl: candidate.photographerUrl }
      : {}),
  };
}

export async function fingerprintImage(path: string): Promise<string> {
  const pixels = await sharp(path)
    .resize(9, 8, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();
  let bits = '';
  for (let row = 0; row < 8; row += 1) {
    const offset = row * 9;
    for (let column = 0; column < 8; column += 1) {
      bits +=
        pixels[offset + column]! > pixels[offset + column + 1]! ? '1' : '0';
    }
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

export function perceptualHashDistance(left: string, right: string): number {
  if (!/^[a-f\d]{16}$/i.test(left) || !/^[a-f\d]{16}$/i.test(right)) {
    throw new Error('Perceptual hashes must be 64-bit hexadecimal strings');
  }
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let distance = 0;
  while (value > 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}
