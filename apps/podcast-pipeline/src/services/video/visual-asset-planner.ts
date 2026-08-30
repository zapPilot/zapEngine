import { rm } from 'node:fs/promises';

import sharp from 'sharp';

import { errorMessage, toError } from '../../lib/errorMessage.js';
import type { ImageCandidate } from '../../types.js';
import {
  type AcquiredRemoteImage,
  acquireRemoteImage,
  type SupportedRemoteImageContentType,
} from './assets.js';
import { filterImageCandidates } from './image-candidates.js';
import {
  defaultImageSearchProviders,
  type ImageSearchProvider,
} from './image-search-provider.js';

const MAX_SEARCH_CANDIDATES_PER_SCENE = 35;
const PERCEPTUAL_HASH_DISTANCE_LIMIT = 6;

export interface VisualAssetScene {
  sceneId: string;
  imageSearchIntent: readonly string[];
  /** The proper nouns this scene names, validated verbatim against its own
   * sentences upstream. Present means image search must return something about
   * one of them; absent means the scene names nothing and any photographable
   * subject will do. */
  imageSearchEntities?: readonly string[];
}

export type VisualImageProvider =
  | 'article'
  | 'brand'
  | ImageSearchProvider['origin'];
export type VisualSelectionMode = 'strict' | 'resilient';
export type VisualReuseKind = 'non-consecutive' | 'consecutive';

const PROVIDER_LICENSES = {
  article: 'unknown',
  brand: 'brand-generated',
  brave: 'unknown',
  pexels: 'pexels',
  pixabay: 'pixabay',
} as const satisfies Record<VisualImageProvider, string>;

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
}

export interface PlannedVisualScene {
  sceneId: string;
  assetId: string;
}

export interface VisualAssetPlan {
  assets: PlannedVisualImage[];
  scenes: PlannedVisualScene[];
}

export interface VisualAssetProgress {
  phase: 'search' | 'assets' | 'cover';
  sceneId: string;
  sceneIndex: number;
  sceneCount: number;
  candidateCount?: number;
  searchResultCount?: number;
  entityFilteredCount?: number;
  searchEntities?: string;
  rejectedCandidateCount?: number;
  rejectionSummary?: string;
  provider?: VisualImageProvider | 'reuse' | 'cover';
  assetId?: string;
  sourceHostname?: string;
  reuseKind?: VisualReuseKind;
  elapsedMs: number;
}

interface VisualAssetPlannerDependencies {
  acquireImage: typeof acquireRemoteImage;
  searchProviders: readonly ImageSearchProvider[];
  fingerprintImage: typeof fingerprintImage;
}

export interface PlanVisualAssetsInput {
  scenes: readonly VisualAssetScene[];
  articleImages?: readonly ImageCandidate[];
  workingDirectory: string;
  selectionMode?: VisualSelectionMode;
  signal?: AbortSignal;
  onProgress?: (event: VisualAssetProgress) => void;
  dependencies?: Partial<VisualAssetPlannerDependencies>;
}

interface VisualAssetPlannerState {
  input: PlanVisualAssetsInput;
  mode: VisualSelectionMode;
  dependencies: VisualAssetPlannerDependencies;
  articleImages: ImageCandidate[];
  articleCursor: number;
  attemptedUrls: Set<string>;
  assets: PlannedVisualImage[];
  scenes: PlannedVisualScene[];
}

interface SelectedVisualImage {
  asset: PlannedVisualImage;
  provider: VisualAssetProgress['provider'];
  rejections: CandidateRejections;
  reuseKind?: VisualReuseKind;
}

interface SearchedVisualImage {
  asset: PlannedVisualImage | null;
  failures: Error[];
  funnel: SearchFunnel;
}

/**
 * `candidateCount` alone cannot say why a scene starved: an empty provider
 * response, the quality filters, and the entity anchor all leave zero. Only the
 * first is a supply problem, and only the last is fixable by rewording the
 * intent -- so a scene that dies here is undiagnosable without the split.
 */
interface SearchFunnel {
  searches: number;
  returned: number;
  viable: number;
  entityFiltered: number;
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

  const state: VisualAssetPlannerState = {
    input,
    mode: input.selectionMode ?? 'strict',
    dependencies: resolvePlannerDependencies(input.dependencies),
    articleImages: viableCandidates(input.articleImages ?? [], [
      'openGraph',
      'article',
      'figure',
    ]),
    articleCursor: 0,
    attemptedUrls: new Set<string>(),
    assets: [],
    scenes: [],
  };

  for (const [sceneIndex, scene] of input.scenes.entries()) {
    input.signal?.throwIfAborted();
    const startedAt = Date.now();
    const selected = await selectImageForScene(state, scene, sceneIndex);

    if (!selected) {
      throw new Error(`Visual scene ${scene.sceneId} has no usable image`);
    }

    state.scenes.push({
      sceneId: scene.sceneId,
      assetId: selected.asset.assetId,
    });
    const sourceHostname = candidateHostname(selected.asset.sourcePageUrl);
    input.onProgress?.({
      phase: 'assets',
      sceneId: scene.sceneId,
      sceneIndex: sceneIndex + 1,
      sceneCount: input.scenes.length,
      provider: selected.provider,
      assetId: selected.asset.assetId,
      ...(sourceHostname ? { sourceHostname } : {}),
      ...(selected.reuseKind ? { reuseKind: selected.reuseKind } : {}),
      ...(selected.rejections.total > 0
        ? {
            rejectedCandidateCount: selected.rejections.total,
            rejectionSummary: summarizeCandidateRejections(selected.rejections),
          }
        : {}),
      elapsedMs: Date.now() - startedAt,
    });
  }

  return { assets: state.assets, scenes: state.scenes };
}

async function selectImageForScene(
  state: VisualAssetPlannerState,
  scene: VisualAssetScene,
  sceneIndex: number,
): Promise<SelectedVisualImage | null> {
  const rejections = createCandidateRejections();
  const articleAsset = await acquireNextArticleImage(state, scene, rejections);
  if (articleAsset) {
    return { asset: articleAsset, provider: 'article', rejections };
  }

  const searched = await acquireSearchedImage(
    state,
    scene,
    sceneIndex,
    rejections,
  );
  if (searched.asset) {
    return {
      asset: searched.asset,
      provider: searched.asset.provider,
      rejections,
    };
  }

  // Strict mode keeps provider failures loud so callers can diagnose a broken
  // search integration. Production uses resilient mode and may reuse an
  // existing image instead of dropping the entire video.
  if (state.mode === 'strict' && searched.failures.length > 0) {
    throw visualSearchFailure(
      scene.sceneId,
      searched.failures,
      rejections,
      searched.funnel,
    );
  }

  const previousAssetId = state.scenes.at(-1)?.assetId;
  const previousAsset = previousAssetId
    ? (state.assets.find((asset) => asset.assetId === previousAssetId) ?? null)
    : null;
  const nonConsecutiveReusable =
    [...state.assets]
      .reverse()
      .find((asset) => asset.assetId !== previousAssetId) ?? null;

  if (nonConsecutiveReusable) {
    if (state.mode === 'resilient') {
      recordSearchFailures(rejections, searched.failures);
    }
    return {
      asset: nonConsecutiveReusable,
      provider: 'reuse',
      reuseKind: 'non-consecutive',
      rejections,
    };
  }

  if (state.mode === 'resilient' && previousAsset) {
    recordSearchFailures(rejections, searched.failures);
    return {
      asset: previousAsset,
      provider: 'reuse',
      reuseKind: 'consecutive',
      rejections,
    };
  }

  if (searched.failures.length > 0) {
    throw visualSearchFailure(
      scene.sceneId,
      searched.failures,
      rejections,
      searched.funnel,
    );
  }
  if (rejections.total > 0) {
    throw candidateExhaustionFailure(
      scene.sceneId,
      rejections,
      searched.funnel,
    );
  }
  if (previousAsset) {
    throw new Error(
      `Visual scene ${scene.sceneId} cannot reuse the immediately preceding image`,
    );
  }
  // Searches ran and every candidate was removed before a single download, by
  // the quality filters or the entity anchor. Reporting the funnel here is the
  // whole point: the detail-less error in `planVisualAssets` is what made this
  // case unreadable, and it stays only for a scene that was never searched.
  if (searched.funnel.searches > 0) {
    throw candidateExhaustionFailure(
      scene.sceneId,
      rejections,
      searched.funnel,
    );
  }
  return null;
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

async function acquireSearchedImage(
  state: VisualAssetPlannerState,
  scene: VisualAssetScene,
  sceneIndex: number,
  rejections: CandidateRejections,
): Promise<SearchedVisualImage> {
  const failures: Error[] = [];
  const providers = orderedSearchProviders(
    state.dependencies.searchProviders,
    state.mode,
    scene,
  );
  const intents = searchIntentsForScene(scene, state.mode);
  const entities = scene.imageSearchEntities ?? [];
  const funnel: SearchFunnel = {
    searches: 0,
    returned: 0,
    viable: 0,
    entityFiltered: 0,
  };

  for (const searchProvider of providers) {
    for (const intent of intents) {
      state.input.signal?.throwIfAborted();
      const searchStartedAt = Date.now();
      const searched = await searchProvider
        .search(intent, {
          count: MAX_SEARCH_CANDIDATES_PER_SCENE,
          ...(state.input.signal ? { signal: state.input.signal } : {}),
        })
        .catch((error: unknown): ImageCandidate[] => {
          if (state.input.signal?.aborted) throw error;
          failures.push(toError(error));
          return [];
        });
      const viable = viableCandidates(searched, [searchProvider.origin]);
      const candidates = rankSearchCandidates(
        viable,
        intent,
        state.assets,
        entities,
      );
      funnel.searches += 1;
      funnel.returned += searched.length;
      funnel.viable += viable.length;
      funnel.entityFiltered += viable.length - candidates.length;
      const rejectedBefore = rejections.total;

      for (const candidate of candidates) {
        const acquired = await tryAcquireUniqueImage({
          candidate,
          provider: searchProvider.origin,
          scene,
          input: state.input,
          dependencies: state.dependencies,
          assets: state.assets,
          attemptedUrls: state.attemptedUrls,
          rejections,
        });
        if (acquired) {
          reportSearchProgress(
            state,
            scene,
            sceneIndex,
            candidates.length,
            rejections,
            rejectedBefore,
            searchStartedAt,
            searchProvider.origin,
            { returned: searched.length, viable: viable.length, entities },
          );
          return { asset: acquired, failures, funnel };
        }
      }
      reportSearchProgress(
        state,
        scene,
        sceneIndex,
        candidates.length,
        rejections,
        rejectedBefore,
        searchStartedAt,
        searchProvider.origin,
        { returned: searched.length, viable: viable.length, entities },
      );
    }
  }
  return { asset: null, failures, funnel };
}

function orderedSearchProviders(
  providers: readonly ImageSearchProvider[],
  mode: VisualSelectionMode,
  scene: VisualAssetScene,
): ImageSearchProvider[] {
  // A scene that names a company, product or person wants the editorial photo
  // of that thing. No stock library holds it, so asking one can only return a
  // plausible picture of something else.
  const usable =
    (scene.imageSearchEntities?.length ?? 0) > 0
      ? providers.filter((provider) => provider.origin === 'brave')
      : providers;
  if (mode === 'strict') return [...usable];

  const priority: Record<ImageSearchProvider['origin'], number> = {
    brave: 0,
    pexels: 1,
    pixabay: 2,
  };
  return usable
    .map((provider, index) => ({ provider, index }))
    .sort(
      (left, right) =>
        priority[left.provider.origin] - priority[right.provider.origin] ||
        left.index - right.index,
    )
    .map(({ provider }) => provider);
}

function searchIntentsForScene(
  scene: VisualAssetScene,
  mode: VisualSelectionMode,
): string[] {
  const original = [
    ...new Set(
      scene.imageSearchIntent
        .map((intent) => intent.trim())
        .filter((intent) => intent.length > 0),
    ),
  ];
  if (mode === 'strict') return original;

  // A named subject is its own best second query: when the phrased intent finds
  // nothing, the bare name still finds photographs of the thing. The generic
  // relaxation below would widen the query away from it instead.
  const entities = [
    ...new Set(
      (scene.imageSearchEntities ?? [])
        .map((entity) => entity.trim())
        .filter((entity) => entity.length > 0 && !original.includes(entity)),
    ),
  ];
  if (entities.length > 0) return [...original, ...entities];

  const relaxed = original
    .map(relaxedSearchIntent)
    .filter((intent): intent is string => intent !== null)
    .filter((intent) => !original.includes(intent));
  return [...original, ...new Set(relaxed)];
}

const RELAXED_SEARCH_NOISE_WORDS = new Set([
  'developers',
  'engineers',
  'founders',
  'people',
  'team',
  'teams',
  'traders',
]);

function relaxedSearchIntent(intent: string): string | null {
  const topicTokens = normalizedSearchTokens(intent)
    .filter((token) => !RELAXED_SEARCH_NOISE_WORDS.has(token))
    .slice(0, 4);
  if (topicTokens.length === 0) return null;
  return `${topicTokens.join(' ')} official event photo`;
}

function reportSearchProgress(
  state: VisualAssetPlannerState,
  scene: VisualAssetScene,
  sceneIndex: number,
  candidateCount: number,
  rejections: CandidateRejections,
  rejectedBefore: number,
  searchStartedAt: number,
  provider: ImageSearchProvider['origin'],
  search: { returned: number; viable: number; entities: readonly string[] },
): void {
  const rejectedCandidateCount = rejections.total - rejectedBefore;
  const entityFilteredCount = search.viable - candidateCount;
  state.input.onProgress?.({
    phase: 'search',
    sceneId: scene.sceneId,
    sceneIndex: sceneIndex + 1,
    sceneCount: state.input.scenes.length,
    candidateCount,
    searchResultCount: search.returned,
    // Only meaningful when the anchor actually removed something: a scene that
    // names nothing keeps every candidate, and a zero here would read as
    // "the anchor was innocent" when it never ran.
    ...(entityFilteredCount > 0
      ? {
          entityFilteredCount,
          searchEntities: search.entities.join('|'),
        }
      : {}),
    ...(rejectedCandidateCount > 0
      ? {
          rejectedCandidateCount,
          rejectionSummary: summarizeCandidateRejections(rejections),
        }
      : {}),
    provider,
    elapsedMs: Date.now() - searchStartedAt,
  });
}

function visualSearchFailure(
  sceneId: string,
  failures: Error[],
  rejections: CandidateRejections,
  funnel: SearchFunnel,
): Error {
  const messages = [...new Set(failures.map((failure) => failure.message))];
  const rejectionDetails = formatCandidateRejectionDetails(rejections);
  return new Error(
    `Visual image search failed for scene ${sceneId}: ${messages.join('; ')}${rejectionDetails}${formatSearchFunnel(funnel)}`,
    { cause: new AggregateError(failures, 'Image search provider failures') },
  );
}

function candidateExhaustionFailure(
  sceneId: string,
  rejections: CandidateRejections,
  funnel: SearchFunnel,
): Error {
  return new Error(
    `Visual scene ${sceneId} has no usable image${formatCandidateRejectionDetails(rejections)}${formatSearchFunnel(funnel)}`,
  );
}

/**
 * The counts a starved scene is diagnosed from, in the order they narrow:
 * how many searches ran, what the providers returned, what survived the quality
 * filters, and how many of those the entity anchor then dropped. This is the
 * only place the anchor's effect is recorded -- `candidateCount` is measured
 * after it, so an anchor that removes everything is indistinguishable from a
 * provider that returned nothing.
 */
function formatSearchFunnel(funnel: SearchFunnel): string {
  if (funnel.searches === 0) return '';
  return ` [searches=${funnel.searches}, returned=${funnel.returned}, viable=${funnel.viable}, entityFiltered=${funnel.entityFiltered}]`;
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
    input.assets.length,
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
  rejections.causes.set(cause, (rejections.causes.get(cause) ?? 0) + 1);
}

function summarizeCandidateRejections(rejections: CandidateRejections): string {
  return [...rejections.causes.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cause, count]) => `${cause}:${count}`)
    .join(',');
}

function formatCandidateRejectionDetails(
  rejections: CandidateRejections,
): string {
  return rejections.total === 0
    ? ''
    : ` after rejecting ${rejections.total} candidate(s) (${summarizeCandidateRejections(rejections)})`;
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
  assetIndex: number,
  perceptualHash: string,
): PlannedVisualImage {
  return {
    assetId: `image-${String(assetIndex + 1).padStart(2, '0')}`,
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

function viableCandidates(
  candidates: readonly ImageCandidate[],
  allowedOrigins: readonly ImageCandidate['origin'][],
): ImageCandidate[] {
  return filterImageCandidates(
    candidates.filter((candidate) => !looksDecorative(candidate)),
    {
      allowedOrigins,
      deduplicate: true,
      maxCandidates: MAX_SEARCH_CANDIDATES_PER_SCENE,
    },
  );
}

const SEARCH_RANKING_NOISE_WORDS = new Set([
  'adult',
  'and',
  'at',
  'documentary',
  'editorial',
  'in',
  'office',
  'photo',
  'photograph',
  'real',
  'the',
  'using',
  'with',
  'working',
  'world',
]);

const NON_EDUCATIONAL_PENALTY_TERMS = [
  'children',
  'classroom',
  'kids',
  'school',
  'student',
] as const;

const HISTORICAL_PENALTY_TERMS = [
  'archive',
  'black-and-white',
  'historical',
  'history',
  'vintage',
] as const;

const COVER_PENALTY_TERMS = [
  'comparison',
  'definition',
  'explained',
  'strategies',
  'versus',
] as const;

const COVER_SOURCE_PENALTY_TERMS = [
  'linkedin.com',
  'medium.com',
  'substack.com',
  'substackcdn.com',
  'youtube.com',
] as const;

const GENERIC_STOCK_PENALTY_TERMS = [
  'business people',
  'business team',
  'collaborating in office',
  'coworkers',
  'futuristic interface',
  'glowing screen',
  'handshake',
  'hologram',
  'looking at laptop',
  'people working in office',
  'smiling team',
  'team meeting',
  'teamwork',
] as const;

const GENERIC_PODCAST_PENALTY_TERMS = [
  'podcast',
  'microphone',
  'studio',
  'headphones',
  'generic finance',
  'generic crypto coin collage',
  'crypto coin collage',
  'coin collage',
] as const;

const SYNTHETIC_IMAGE_TERMS = [
  '3d illustration',
  '3d render',
  'ai generated',
  'ai-generated',
  'concept art',
  'dall-e',
  'dalle',
  'digital art',
  'generated by ai',
  'generative artwork',
  'midjourney',
  'stable diffusion',
  'synthetic image',
] as const;

const EDITORIAL_OR_OFFICIAL_SOURCE_TERMS = [
  '.gov',
  '.int',
  'apnews.com',
  'bbc.com',
  'bloomberg.com',
  'cnbc.com',
  'coindesk.com',
  'cointelegraph.com',
  'ecb.europa.eu',
  'ethereum.org',
  'federalreserve.gov',
  'ft.com',
  'reuters.com',
  'sec.gov',
  'theblock.co',
  'theguardian.com',
  'whitehouse.gov',
  'wsj.com',
] as const;

const STOCK_PREVIEW_TERMS = [
  '123rf',
  'adobestock',
  'alamy',
  'depositphotos',
  'dreamstime',
  'freepik',
  'gettyimages',
  'istockphoto',
  'shutterstock',
  'stock-photo',
  'stock_photo',
  'vecteezy',
] as const;

// These publishers primarily expose article-cover artwork with the headline
// baked into the pixels. The renderer already burns locale subtitles, so a
// search result from one of these sources would recreate the text-card layout
// that the image-only pipeline is intended to remove.
const TEXT_CARD_PUBLISHER_TERMS = [
  'academy.kku.ac.th',
  'alexablockchain.com',
  'bitget.com',
  'blockchain-council.org',
  'blockchainreporter.net',
  'blogger.googleusercontent.com',
  'blogspot.com',
  'ccn.com',
  'chainaware.ai',
  'chainport.io',
  'collibra.com',
  'corytech.com',
  'dipprofit.com',
  'emilyandblair.com',
  'ideausher.com',
  'klever.org',
  'news.cgtn.com',
  'resourcecenter.systemscouncil.ieee.org',
  'solulab.com',
  'slideteam.net',
  'startupfactory.bg',
  'technollogy.com',
  'uniondevelopers.com',
  'var-meta.com',
] as const;

function rankSearchCandidates(
  candidates: readonly ImageCandidate[],
  intent: string,
  existingAssets: readonly PlannedVisualImage[],
  entities: readonly string[],
): ImageCandidate[] {
  return candidates
    .filter((candidate) => mentionsAnyEntity(candidate, entities))
    .map((candidate, index) => ({
      candidate,
      index,
      score: searchCandidateScore(candidate, intent, existingAssets),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ candidate }) => candidate);
}

/**
 * The one hard relevance rule, and it is about identity rather than wording. A
 * scene that names Coldcard cannot be illustrated by a photo whose title, page
 * and URL never mention Coldcard, however many words the query happens to share
 * with it — sharing a word is precisely how a thousand-yard-stare war portrait
 * and an odd-and-even-numbers worksheet were selected for a Bitcoin episode.
 *
 * A scene that names nothing has no identity to check, and keeps every
 * candidate the quality filters already allow.
 */
function mentionsAnyEntity(
  candidate: ImageCandidate,
  entities: readonly string[],
): boolean {
  if (entities.length === 0) return true;
  const corpus = ` ${entityMatchText(normalizedSearchCandidateCorpus(candidate))}`;
  return entities.some((entity) => {
    const name = entityMatchText(entity);
    return name.length > 0 && corpus.includes(` ${name}`);
  });
}

/**
 * Collapses every separator to a single space so a name matches however the
 * page spells it — `coldcard-mk4-review`, `Coldcard_Mk4`, `Coldcard Mk4`. The
 * ranking corpus keeps its own punctuation, because the penalty term lists
 * matched against it contain hostnames.
 */
function entityMatchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function candidateDimensionScore(candidate: ImageCandidate): number {
  if (!candidate.width || !candidate.height) return 0;
  let score = 0;
  if (Math.max(candidate.width, candidate.height) >= 1920) score += 3;
  const aspectRatio = candidate.width / candidate.height;
  if (aspectRatio >= 0.9 && aspectRatio <= 1.6) score += 3;
  else if (aspectRatio > 1.6 && aspectRatio <= 2.0) score += 1;
  if (aspectRatio < 0.75) score -= 4;
  return score;
}

function searchCandidateScore(
  candidate: ImageCandidate,
  intent: string,
  existingAssets: readonly PlannedVisualImage[],
): number {
  const corpus = normalizedSearchCandidateCorpus(candidate);
  const queryTokens = normalizedSearchTokens(intent);
  let score = queryTokens.reduce(
    (sum, token) => sum + (corpus.includes(token) ? tokenMatchScore(token) : 0),
    0,
  );

  const extension = imageFileExtension(candidate.imageUrl);
  if (extension === 'jpg' || extension === 'jpeg') score += 4;
  else if (extension === 'webp') score += 2;
  else if (extension === 'png') score -= 3;

  score += candidateDimensionScore(candidate);

  const normalizedIntent = intent.toLowerCase();
  if (
    !/(?:education|school|student|classroom|children|kids)/i.test(
      normalizedIntent,
    ) &&
    includesAny(corpus, NON_EDUCATIONAL_PENALTY_TERMS)
  ) {
    score -= 30;
  }
  if (
    !/(?:history|historical|archive|vintage)/i.test(normalizedIntent) &&
    includesAny(corpus, HISTORICAL_PENALTY_TERMS)
  ) {
    score -= 20;
  }
  if (
    includesAny(corpus, COVER_PENALTY_TERMS) ||
    corpus.includes(' vs ') ||
    corpus.includes(' vs. ')
  ) {
    score -= 12;
  }
  if (includesAny(corpus, COVER_SOURCE_PENALTY_TERMS)) score -= 12;
  if (includesAny(corpus, GENERIC_STOCK_PENALTY_TERMS)) score -= 16;
  if (
    !/(?:podcast|microphone|studio|headphones)/i.test(normalizedIntent) &&
    includesAny(corpus, GENERIC_PODCAST_PENALTY_TERMS)
  ) {
    score -= 30;
  }

  const sourceHostname = candidateHostname(candidate.sourceUrl);
  if (sourceHostname) {
    if (
      candidate.origin === 'brave' &&
      includesAny(sourceHostname, EDITORIAL_OR_OFFICIAL_SOURCE_TERMS)
    ) {
      score += 18;
    }
    const priorUses = existingAssets.filter(
      (asset) => candidateHostname(asset.sourcePageUrl) === sourceHostname,
    ).length;
    score -= priorUses * 4;
  }
  return score;
}

function normalizedSearchCandidateCorpus(candidate: ImageCandidate): string {
  const raw = `${candidate.altText ?? ''} ${candidate.imageUrl} ${candidate.sourceUrl}`;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Some publisher URLs contain stray percent signs. The raw value still
    // provides deterministic metadata for ranking.
  }
  return decoded.normalize('NFKC').toLowerCase();
}

function normalizedSearchTokens(intent: string): string[] {
  return [
    ...new Set(
      (
        intent
          .normalize('NFKC')
          .toLowerCase()
          .match(/[\p{L}\p{N}]{2,}/gu) ?? []
      ).filter((token) => !SEARCH_RANKING_NOISE_WORDS.has(token)),
    ),
  ];
}

function tokenMatchScore(token: string): number {
  if (/\d/u.test(token)) return 8;
  return token.length >= 7 ? 5 : 3;
}

function imageFileExtension(rawUrl: string): string | null {
  try {
    const filename = new URL(rawUrl).pathname.split('/').at(-1) ?? '';
    return /\.([a-z\d]+)$/i.exec(filename)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

function candidateHostname(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function includesAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function looksDecorative(candidate: ImageCandidate): boolean {
  const value = normalizedSearchCandidateCorpus(candidate);
  if (
    /(?:^|[./_\-\s])(avatar|emoji|emoticon|favicon|icon|logo|profile|sprite|sticker|thumb|thumbnail|wechat|weibo)(?:[./_\-\s]|$)/i.test(
      value,
    )
  ) {
    return true;
  }
  if (
    isSearchCandidate(candidate) &&
    includesAny(value, SYNTHETIC_IMAGE_TERMS)
  ) {
    return true;
  }
  if (includesAny(value, STOCK_PREVIEW_TERMS)) return true;
  if (includesAny(value, TEXT_CARD_PUBLISHER_TERMS)) return true;
  return (
    candidate.origin === 'brave' && looksLikeTextHeavySearchResult(candidate)
  );
}

function isSearchCandidate(candidate: ImageCandidate): boolean {
  return (
    candidate.origin === 'brave' ||
    candidate.origin === 'pexels' ||
    candidate.origin === 'pixabay'
  );
}

function looksLikeTextHeavySearchResult(candidate: ImageCandidate): boolean {
  const altText = candidate.altText?.toLowerCase() ?? '';
  const urlMetadata =
    `${candidate.imageUrl} ${candidate.sourceUrl}`.toLowerCase();
  const textHeavyAlt =
    /\b(infographic|diagram|chart|presentation|slides?|poster|tutorial|screenshot|template|wallpaper|quote|whitepaper|explainer)\b/i;
  const instructionalAlt =
    /\bhow\s+to\b/i.test(altText) ||
    /\bwhat\s+is\b/i.test(altText) ||
    /\bwhat\s+are\b/i.test(altText) ||
    /\btypes?\s+of\b/i.test(altText) ||
    /\bstep[- ]by[- ]step\b/i.test(altText) ||
    /\bbeginners?\s+guide\b/i.test(altText) ||
    /\bbeginner's\s+guide\b/i.test(altText) ||
    /\btop\s+\d+\b/i.test(altText);
  const textHeavyUrlTerms = [
    'blog-creative',
    'blog_creative',
    'diagram',
    'infographic',
    'poster',
    'powerpoint',
    'presentation',
    'quote',
    'screenshot',
    'slide',
    'template',
    'thumbnail-with-play',
    'tutorial',
    'types-of',
    'types_of',
    'use-case',
    'use_case',
  ] as const;
  const textHeavySourceTerms = [
    '.pdf',
    '.ppt',
    '.pptx',
    '/quotes/',
    'canva.com',
    'quotefancy.com',
    'scribd.com',
    'slideshare.net',
  ] as const;
  const chineseTextCard =
    /(?:資訊圖|圖表|簡報|投影片|海報|教學|懶人包|排行榜|排名|報告)/u;
  return (
    textHeavyAlt.test(altText) ||
    instructionalAlt ||
    chineseTextCard.test(altText) ||
    includesAny(urlMetadata, textHeavyUrlTerms) ||
    includesAny(urlMetadata, textHeavySourceTerms)
  );
}

function canonicalCandidateUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
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
