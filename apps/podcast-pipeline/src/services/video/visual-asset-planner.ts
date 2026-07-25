import { rm } from 'node:fs/promises';

import sharp from 'sharp';

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
}

export type VisualImageProvider = 'article' | ImageSearchProvider['origin'];

const PROVIDER_LICENSES = {
  article: 'unknown',
  bing: 'unknown',
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
  phase: 'search' | 'assets';
  sceneId: string;
  sceneIndex: number;
  sceneCount: number;
  candidateCount?: number;
  rejectedCandidateCount?: number;
  rejectionSummary?: string;
  provider?: VisualImageProvider | 'reuse';
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
  signal?: AbortSignal;
  onProgress?: (event: VisualAssetProgress) => void;
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
}

interface SelectedVisualImage {
  asset: PlannedVisualImage;
  provider: VisualAssetProgress['provider'];
  rejections: CandidateRejections;
}

interface SearchedVisualImage {
  asset: PlannedVisualImage | null;
  failures: Error[];
}

function resolvePlannerDependencies(
  overrides: Partial<VisualAssetPlannerDependencies> | undefined,
): VisualAssetPlannerDependencies {
  return {
    acquireImage: acquireRemoteImage,
    fingerprintImage,
    // Resolved per invocation so API-key env changes take effect without a
    // module reload.
    searchProviders: defaultImageSearchProviders(),
    ...overrides,
  };
}

interface CandidateRejections {
  total: number;
  causes: Map<string, number>;
}

export async function planVisualAssets(
  input: PlanVisualAssetsInput,
): Promise<VisualAssetPlan> {
  if (input.scenes.length === 0) {
    throw new Error('Visual asset planning requires at least one scene');
  }

  const state: VisualAssetPlannerState = {
    input,
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
      throw new Error(
        state.assets.length === 0
          ? `Visual scene ${scene.sceneId} has no usable image`
          : `Visual scene ${scene.sceneId} cannot reuse the immediately preceding image`,
      );
    }

    state.scenes.push({
      sceneId: scene.sceneId,
      assetId: selected.asset.assetId,
    });
    input.onProgress?.({
      phase: 'assets',
      sceneId: scene.sceneId,
      sceneIndex: sceneIndex + 1,
      sceneCount: input.scenes.length,
      provider: selected.provider,
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
  if (searched.failures.length > 0) {
    throw visualSearchFailure(scene.sceneId, searched.failures, rejections);
  }

  const previousAssetId = state.scenes.at(-1)?.assetId;
  const reusable =
    [...state.assets]
      .reverse()
      .find((asset) => asset.assetId !== previousAssetId) ?? null;
  if (reusable) return { asset: reusable, provider: 'reuse', rejections };
  if (rejections.total > 0) {
    throw candidateExhaustionFailure(scene.sceneId, rejections);
  }
  return null;
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
  // Providers are ordered license-clean first; each provider exhausts every
  // search intent before the chain falls through to the next provider.
  for (const searchProvider of state.dependencies.searchProviders) {
    for (const intent of scene.imageSearchIntent) {
      state.input.signal?.throwIfAborted();
      const searchStartedAt = Date.now();
      const searched = await searchProvider
        .search(intent, {
          count: MAX_SEARCH_CANDIDATES_PER_SCENE,
          ...(state.input.signal ? { signal: state.input.signal } : {}),
        })
        .catch((error: unknown): ImageCandidate[] => {
          if (state.input.signal?.aborted) throw error;
          failures.push(normalizeError(error));
          return [];
        });
      const candidates = rankSearchCandidates(
        viableCandidates(searched, [searchProvider.origin]),
        intent,
        state.assets,
      );
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
          );
          return { asset: acquired, failures };
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
      );
    }
  }
  return { asset: null, failures };
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
): void {
  const rejectedCandidateCount = rejections.total - rejectedBefore;
  state.input.onProgress?.({
    phase: 'search',
    sceneId: scene.sceneId,
    sceneIndex: sceneIndex + 1,
    sceneCount: state.input.scenes.length,
    candidateCount,
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

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

function visualSearchFailure(
  sceneId: string,
  failures: Error[],
  rejections: CandidateRejections,
): Error {
  const messages = [...new Set(failures.map((failure) => failure.message))];
  const rejectionDetails = formatCandidateRejectionDetails(rejections);
  return new Error(
    `Visual image search failed for scene ${sceneId}: ${messages.join('; ')}${rejectionDetails}`,
    { cause: new AggregateError(failures, 'Image search provider failures') },
  );
}

function candidateExhaustionFailure(
  sceneId: string,
  rejections: CandidateRejections,
): Error {
  return new Error(
    `Visual scene ${sceneId} has no usable image${formatCandidateRejectionDetails(rejections)}`,
  );
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
  const message = error instanceof Error ? error.message : String(error);
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
): ImageCandidate[] {
  const queryTokens = normalizedSearchTokens(intent);
  return (
    candidates
      // Curated stock APIs already matched the query semantically; the overlap
      // recheck only guards the noisy Bing HTML scrape.
      .filter(
        (candidate) =>
          candidate.origin !== 'bing' ||
          hasSemanticSearchOverlap(candidate, queryTokens),
      )
      .map((candidate, index) => ({
        candidate,
        index,
        score: searchCandidateScore(candidate, intent, existingAssets),
      }))
      .sort(
        (left, right) => right.score - left.score || left.index - right.index,
      )
      .map(({ candidate }) => candidate)
  );
}

function hasSemanticSearchOverlap(
  candidate: ImageCandidate,
  queryTokens: readonly string[],
): boolean {
  if (queryTokens.length === 0) return true;
  const corpus = normalizedSearchCandidateCorpus(candidate);
  return queryTokens.some((token) => corpus.includes(token));
}

function candidateDimensionScore(candidate: ImageCandidate): number {
  if (!candidate.width || !candidate.height) return 0;
  let score = 0;
  if (Math.max(candidate.width, candidate.height) >= 1920) score += 3;
  const aspectRatio = candidate.width / candidate.height;
  // The 1080x960 media window (aspect 1.125) crops squarish sources least;
  // strongly portrait sources lose most of their content to the cover crop.
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

  const sourceHostname = candidateHostname(candidate.sourceUrl);
  if (sourceHostname) {
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
  const value =
    `${candidate.imageUrl} ${candidate.sourceUrl} ${candidate.altText ?? ''}`.toLowerCase();
  if (
    /(?:^|[./_\-\s])(avatar|emoji|emoticon|favicon|icon|logo|profile|sprite|sticker|thumb|thumbnail|wechat|weibo)(?:[./_\-\s]|$)/i.test(
      value,
    )
  ) {
    return true;
  }
  if (includesAny(value, STOCK_PREVIEW_TERMS)) return true;
  if (includesAny(value, TEXT_CARD_PUBLISHER_TERMS)) return true;
  return (
    candidate.origin === 'bing' && looksLikeTextHeavySearchResult(candidate)
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
