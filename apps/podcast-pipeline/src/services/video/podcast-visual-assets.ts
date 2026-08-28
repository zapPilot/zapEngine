import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { ZAP_PILOT_SITE_URL } from '../../brand/cta.js';
import type { ImageCandidate } from '../../types.js';
import { podcastBrandVisualKind } from '../podcast-packaging.js';
import { type AcquiredRemoteImage, acquireRemoteImage } from './assets.js';
import { filterImageCandidates } from './image-candidates.js';
import {
  defaultImageSearchProviders,
  type ImageSearchProvider,
} from './image-search-provider.js';
import { videoAssetPaths } from './runtime-assets.js';
import { MAX_STORYBOARD_SLIDES } from './storyboard/draft.js';
import {
  fingerprintImage,
  perceptualHashDistance,
  type PlannedVisualImage,
  planVisualAssets,
  type PlanVisualAssetsInput,
  type VisualAssetPlan,
  type VisualAssetProgress,
} from './visual-asset-planner.js';

const PODCAST_INTRO_ASSET_ID = 'image-98';
const PODCAST_OUTRO_ASSET_ID = 'image-99';

if (MAX_STORYBOARD_SLIDES >= 98) {
  throw new Error('Podcast intro asset ID collides with storyboard assets');
}
if (MAX_STORYBOARD_SLIDES >= 99) {
  throw new Error('Podcast outro asset ID collides with storyboard assets');
}

export interface CoverSelectionInput {
  scene: { sceneId: string; imageSearchIntent: readonly string[] };
  articleImages?: readonly ImageCandidate[];
  workingDirectory: string;
  signal?: AbortSignal;
  dependencies?: Partial<{
    acquireImage: typeof acquireRemoteImage;
    searchProviders: readonly ImageSearchProvider[];
    fingerprintImage: typeof fingerprintImage;
  }>;
  existingAssets?: readonly PlannedVisualImage[];
}

export interface CoverSelectionResult {
  asset: PlannedVisualImage;
  candidateCount: number;
  ranked: boolean;
}

function resolveCoverDependencies(
  overrides: CoverSelectionInput['dependencies'],
): {
  acquireImage: typeof acquireRemoteImage;
  searchProviders: readonly ImageSearchProvider[];
  fingerprintImage: typeof fingerprintImage;
} {
  return {
    acquireImage: overrides?.acquireImage ?? acquireRemoteImage,
    // Only built when the caller brought no chain of its own: the default one
    // fails closed on a missing Brave key.
    searchProviders:
      overrides?.searchProviders ?? defaultImageSearchProviders(),
    fingerprintImage: overrides?.fingerprintImage ?? fingerprintImage,
  };
}

function candidateHostname(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function coverDimensionScore(candidate: ImageCandidate): number {
  if (!candidate.width || !candidate.height) return 0;
  let score = 0;
  const area = candidate.width * candidate.height;
  if (area >= 3000000) score += 5;
  else if (area >= 1500000) score += 3;
  const aspect = candidate.width / candidate.height;
  if (aspect >= 0.9 && aspect <= 1.6) score += 3;
  else if (aspect > 1.6 && aspect <= 2.0) score += 1;
  if (aspect < 0.75) score -= 4;
  return score;
}

function coverCandidateScore(
  candidate: ImageCandidate,
  intent: string,
  existingAssets: readonly PlannedVisualImage[],
): number {
  const corpus =
    `${candidate.altText ?? ''} ${candidate.imageUrl} ${candidate.sourceUrl}`.toLowerCase();
  let score = 0;
  if (candidate.origin === 'article') score += 10;
  else if (candidate.origin === 'brave') score += 8;
  else if (candidate.origin === 'pexels') score += 5;
  else if (candidate.origin === 'pixabay') score += 3;

  score += coverDimensionScore(candidate);

  const ext = candidate.imageUrl.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'jpg' || ext === 'jpeg') score += 4;
  else if (ext === 'webp') score += 2;
  else if (ext === 'png') score -= 3;

  if (
    !/(podcast|microphone|studio|headphones)/i.test(intent) &&
    /(podcast|microphone|studio|headphones)/i.test(corpus)
  ) {
    score -= 30;
  }
  if (
    /infographic|diagram|chart|presentation|poster|template|wallpaper/i.test(
      corpus,
    )
  ) {
    score -= 12;
  }

  const hostname = candidateHostname(candidate.sourceUrl);
  if (hostname) {
    const prior = existingAssets.filter(
      (a) => candidateHostname(a.sourcePageUrl) === hostname,
    ).length;
    score -= prior * 4;
  }
  return score;
}

function viableCoverCandidates(
  candidates: readonly ImageCandidate[],
  allowedOrigins: readonly ImageCandidate['origin'][],
): ImageCandidate[] {
  return filterImageCandidates(
    candidates.filter(
      (c) => !c.altText || !/avatar|logo|icon/i.test(c.altText),
    ),
    {
      allowedOrigins,
      deduplicate: true,
      maxCandidates: 35,
    },
  );
}

function rankCoverCandidates(
  candidates: readonly ImageCandidate[],
  intent: string,
  existingAssets: readonly PlannedVisualImage[],
): ImageCandidate[] {
  return [...candidates]
    .map((c, idx) => ({
      c,
      idx,
      score: coverCandidateScore(c, intent, existingAssets),
    }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .map(({ c }) => c);
}

async function tryAcquireCoverCandidate(
  candidate: ImageCandidate,
  provider: string,
  sceneId: string,
  workingDirectory: string,
  signal: AbortSignal | undefined,
  dependencies: ReturnType<typeof resolveCoverDependencies>,
  existingAssets: readonly PlannedVisualImage[],
  collected: PlannedVisualImage[],
  attemptedUrls: Set<string>,
): Promise<PlannedVisualImage | null> {
  const canonical = (() => {
    try {
      const u = new URL(candidate.imageUrl);
      u.hash = '';
      return u.href;
    } catch {
      return null;
    }
  })();
  if (!canonical) return null;
  if (attemptedUrls.has(canonical)) return null;
  attemptedUrls.add(canonical);

  let acquired: AcquiredRemoteImage | null;
  try {
    acquired = await dependencies.acquireImage(candidate.imageUrl, {
      workingDirectory,
      filename: `${sceneId}-cover-${String(attemptedUrls.size).padStart(3, '0')}`,
      layout: 'fullBleed',
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return null;
  }
  if (!acquired) return null;

  const perceptualHash = await dependencies.fingerprintImage(acquired.path);
  const duplicate = [...existingAssets, ...collected].some(
    (a) =>
      a.sha256 === acquired.sha256 ||
      perceptualHashDistance(a.perceptualHash, perceptualHash) <= 6,
  );
  if (duplicate) {
    await rm(acquired.path, { force: true });
    return null;
  }

  let coverLicense: PlannedVisualImage['license'] = 'unknown';
  if (provider === 'pexels') coverLicense = 'pexels';
  else if (provider === 'pixabay') coverLicense = 'pixabay';
  const planned: PlannedVisualImage = {
    assetId: `image-01`,
    path: acquired.path,
    contentType: acquired.contentType,
    sha256: acquired.sha256,
    perceptualHash,
    width: acquired.width,
    height: acquired.height,
    originalImageUrl: candidate.imageUrl,
    sourcePageUrl: candidate.sourceUrl,
    provider: provider as PlannedVisualImage['provider'],
    license: coverLicense,
    ...(candidate.photographer ? { photographer: candidate.photographer } : {}),
    ...(candidate.photographerUrl
      ? { photographerUrl: candidate.photographerUrl }
      : {}),
  };
  return planned;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function selectCoverAssetForFirstScene(
  input: CoverSelectionInput,
): Promise<CoverSelectionResult | null> {
  const dependencies = resolveCoverDependencies(input.dependencies);
  const attemptedUrls = new Set<string>();
  const collected: { candidate: ImageCandidate; asset: PlannedVisualImage }[] =
    [];
  const existingAssets = input.existingAssets ?? [];
  const signal = input.signal;
  const MAX_CANDIDATES = 2;

  await mkdir(input.workingDirectory, { recursive: true });

  // Try article images first (use viable filter to respect decorative / dedupe)
  const articleCandidates = viableCoverCandidates(input.articleImages ?? [], [
    'article',
    'openGraph',
    'figure',
  ] as unknown as ImageCandidate['origin'][]);
  for (const candidate of articleCandidates) {
    if (collected.length >= MAX_CANDIDATES) break;
    signal?.throwIfAborted();
    const asset = await tryAcquireCoverCandidate(
      candidate,
      'article',
      input.scene.sceneId,
      input.workingDirectory,
      signal,
      dependencies,
      existingAssets,
      collected.map((c) => c.asset),
      attemptedUrls,
    );
    if (asset) collected.push({ candidate, asset });
  }

  if (collected.length < MAX_CANDIDATES) {
    const providers = [...dependencies.searchProviders].sort((a, b) => {
      const prio: Record<string, number> = { brave: 0, pexels: 1, pixabay: 2 };
      return (prio[a.origin] ?? 99) - (prio[b.origin] ?? 99);
    });
    for (const provider of providers) {
      for (const intent of input.scene.imageSearchIntent) {
        if (collected.length >= MAX_CANDIDATES) break;
        signal?.throwIfAborted();
        let searched: ImageCandidate[];
        try {
          searched = await provider.search(intent, {
            count: 35,
            ...(signal ? { signal } : {}),
          });
        } catch (error) {
          if (signal?.aborted) throw error;
          continue;
        }
        const viable = viableCoverCandidates(searched, [provider.origin]);
        const ranked = rankCoverCandidates(viable, intent, [
          ...existingAssets,
          ...collected.map((c) => c.asset),
        ]);
        for (const candidate of ranked) {
          if (collected.length >= MAX_CANDIDATES) break;
          const asset = await tryAcquireCoverCandidate(
            candidate,
            provider.origin,
            input.scene.sceneId,
            input.workingDirectory,
            signal,
            dependencies,
            existingAssets,
            collected.map((c) => c.asset),
            attemptedUrls,
          );
          if (asset) collected.push({ candidate, asset });
        }
      }
      if (collected.length >= MAX_CANDIDATES) break;
    }
  }

  if (collected.length === 0) return null;

  // Rank collected assets by cover score (using their candidate intent)
  // For ranking, use first intent
  const intent = input.scene.imageSearchIntent[0] ?? '';
  const scored = collected
    .map(({ candidate, asset }, idx) => ({
      candidate,
      asset,
      idx,
      score: coverCandidateScore(candidate, intent, existingAssets),
    }))
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  const winner = scored[0]!.asset;
  // Clean up losers
  for (let i = 1; i < scored.length; i++) {
    await rm(scored[i]!.asset.path, { force: true }).catch(() => {});
  }

  // Winner should keep image-01
  return {
    asset: { ...winner, assetId: 'image-01' },
    candidateCount: collected.length,
    ranked: collected.length > 1,
  };
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function planPodcastVisualAssets(
  input: PlanVisualAssetsInput,
): Promise<VisualAssetPlan> {
  const brandScenes = input.scenes.filter(
    (scene) => podcastBrandVisualKind(scene.imageSearchIntent) !== null,
  );
  const contentScenes = input.scenes.filter(
    (scene) => podcastBrandVisualKind(scene.imageSearchIntent) === null,
  );
  const originalSceneIndex = new Map(
    input.scenes.map((scene, index) => [scene.sceneId, index]),
  );
  const assets: PlannedVisualImage[] = [];

  for (const brandScene of brandScenes) {
    const kind = podcastBrandVisualKind(brandScene.imageSearchIntent);
    if (kind === 'intro') {
      const introAsset = await createPodcastIntroAsset(input.workingDirectory);
      assets.push(introAsset);
      reportBrandAssetProgress(
        input,
        brandScene.sceneId,
        originalSceneIndex.get(brandScene.sceneId) ?? 0,
        PODCAST_INTRO_ASSET_ID,
      );
    } else if (kind === 'outro') {
      const outroAsset = await createPodcastOutroAsset(input.workingDirectory);
      assets.push(outroAsset);
      reportBrandAssetProgress(
        input,
        brandScene.sceneId,
        originalSceneIndex.get(brandScene.sceneId) ?? 0,
        PODCAST_OUTRO_ASSET_ID,
      );
    }
  }

  if (contentScenes.length === 0) {
    const scenes = mapScenesWithBrand(input.scenes, new Map());
    return { assets, scenes };
  }

  const coverScene = contentScenes[0]!;
  const remainingScenes = contentScenes.slice(1);
  let coverResult: CoverSelectionResult | null = null;
  let coverFallback = false;

  if (coverScene) {
    const coverStart = Date.now();
    try {
      coverResult = await selectCoverAssetForFirstScene({
        scene: coverScene,
        articleImages: input.articleImages,
        workingDirectory: join(input.workingDirectory, 'cover'),
        signal: input.signal,
        dependencies: input.dependencies,
        existingAssets: [],
      });
      if (coverResult) {
        assets.push(coverResult.asset);
        input.onProgress?.({
          phase: 'cover',
          sceneId: coverScene.sceneId,
          sceneIndex: (originalSceneIndex.get(coverScene.sceneId) ?? 0) + 1,
          sceneCount: input.scenes.length,
          candidateCount: coverResult.candidateCount,
          provider: 'cover',
          assetId: coverResult.asset.assetId,
          elapsedMs: Date.now() - coverStart,
        });
      } else {
        coverFallback = true;
      }
    } catch (error) {
      if (input.signal?.aborted) throw error;
      coverFallback = true;
    }
    if (coverFallback) {
      input.onProgress?.({
        phase: 'cover',
        sceneId: coverScene.sceneId,
        sceneIndex: (originalSceneIndex.get(coverScene.sceneId) ?? 0) + 1,
        sceneCount: input.scenes.length,
        candidateCount: 0,
        provider: 'cover',
        assetId: 'none',
        elapsedMs: Date.now() - coverStart,
      });
    }
  }

  // If cover selector failed, fallback to generic planner for all content scenes (covers WP12 fallback)
  if (!coverResult) {
    const fallbackPlan = await planVisualAssets({
      ...input,
      scenes: contentScenes,
      onProgress: remappedProgressHandler(
        input.onProgress,
        originalSceneIndex,
        input.scenes.length,
      ),
    });
    assets.push(...fallbackPlan.assets);
    const scenes = mapScenesWithBrand(
      input.scenes,
      new Map(
        fallbackPlan.scenes.map((scene) => [scene.sceneId, scene.assetId]),
      ),
    );
    return { assets, scenes };
  }

  let remainingPlan: VisualAssetPlan | null = null;
  if (remainingScenes.length > 0) {
    // Filter article images already used for cover
    let remainingArticleImages = input.articleImages ?? [];
    remainingArticleImages = remainingArticleImages.filter(
      (c) => c.imageUrl !== coverResult.asset.originalImageUrl,
    );
    remainingPlan = await planVisualAssets({
      ...input,
      scenes: remainingScenes,
      articleImages: remainingArticleImages,
      workingDirectory: join(input.workingDirectory, 'remaining'),
      onProgress: remappedProgressHandler(
        input.onProgress,
        originalSceneIndex,
        input.scenes.length,
      ),
    });
    // Remap IDs to avoid collision with cover image-01
    const remappedAssets: PlannedVisualImage[] = [];
    const idMap = new Map<string, string>();
    let nextId = 2;
    for (const asset of remainingPlan.assets) {
      // If duplicate of cover, reuse cover
      if (
        asset.sha256 === coverResult.asset.sha256 ||
        perceptualHashDistance(
          asset.perceptualHash,
          coverResult.asset.perceptualHash,
        ) <= 6
      ) {
        idMap.set(asset.assetId, coverResult.asset.assetId);
        // Remove duplicate file
        await rm(asset.path, { force: true }).catch(() => {});
        continue;
      }
      const newId = `image-${String(nextId++).padStart(2, '0')}`;
      idMap.set(asset.assetId, newId);
      remappedAssets.push({ ...asset, assetId: newId });
    }
    const remappedScenes = remainingPlan.scenes.map((s) => ({
      sceneId: s.sceneId,
      assetId: idMap.get(s.assetId) ?? s.assetId,
    }));
    remainingPlan = { assets: remappedAssets, scenes: remappedScenes };
    assets.push(...remappedAssets);
  }

  if (coverResult && remainingPlan) {
    const combined = new Map<string, string>([
      [coverScene.sceneId, coverResult.asset.assetId],
      ...remainingPlan.scenes.map((s) => [s.sceneId, s.assetId] as const),
    ]);
    const finalScenes = mapScenesWithBrand(input.scenes, combined);
    return { assets, scenes: finalScenes };
  }

  if (coverResult && !remainingPlan) {
    const scenes = mapScenesWithBrand(
      input.scenes,
      new Map([[coverScene.sceneId, coverResult.asset.assetId]]),
    );
    return { assets, scenes };
  }

  // Fallback case already handled, but for completeness
  const scenes = mapScenesWithBrand(
    input.scenes,
    new Map(
      (remainingPlan?.scenes ?? []).map((scene) => [
        scene.sceneId,
        scene.assetId,
      ]),
    ),
  );
  return { assets, scenes };
}

function reportBrandAssetProgress(
  input: PlanVisualAssetsInput,
  sceneId: string,
  sceneIndex: number,
  assetId: string,
): void {
  input.onProgress?.({
    phase: 'assets',
    sceneId,
    sceneIndex: sceneIndex + 1,
    sceneCount: input.scenes.length,
    provider: 'brand',
    assetId,
    elapsedMs: 0,
  });
}

function remapProgress(
  progress: VisualAssetProgress,
  originalSceneIndex: ReadonlyMap<string, number>,
  sceneCount: number,
): VisualAssetProgress {
  const index = originalSceneIndex.get(progress.sceneId);
  return {
    ...progress,
    sceneIndex: index === undefined ? progress.sceneIndex : index + 1,
    sceneCount,
  };
}

function mapScenesWithBrand(
  scenes: readonly { sceneId: string; imageSearchIntent: readonly string[] }[],
  assetByScene: ReadonlyMap<string, string>,
): { sceneId: string; assetId: string }[] {
  return scenes.map((scene) => {
    const kind = podcastBrandVisualKind(scene.imageSearchIntent);
    if (kind === 'intro')
      return { sceneId: scene.sceneId, assetId: PODCAST_INTRO_ASSET_ID };
    if (kind === 'outro')
      return { sceneId: scene.sceneId, assetId: PODCAST_OUTRO_ASSET_ID };
    const assetId = assetByScene.get(scene.sceneId);
    if (!assetId)
      throw new Error(`Content scene ${scene.sceneId} has no planned asset`);
    return { sceneId: scene.sceneId, assetId };
  });
}

function remappedProgressHandler(
  onProgress: PlanVisualAssetsInput['onProgress'],
  originalSceneIndex: ReadonlyMap<string, number>,
  sceneCount: number,
): PlanVisualAssetsInput['onProgress'] {
  if (!onProgress) return undefined;
  return (progress) =>
    onProgress(remapProgress(progress, originalSceneIndex, sceneCount));
}

async function createBrandAsset(
  workingDirectory: string,
  assetId: string,
  sourcePath: string,
): Promise<PlannedVisualImage> {
  await mkdir(workingDirectory, { recursive: true });
  const path = join(workingDirectory, `${assetId}.png`);
  await copyFile(sourcePath, path);
  const [bytes, metadata] = await Promise.all([
    readFile(path),
    sharp(path).metadata(),
  ]);
  if (!metadata.width || !metadata.height) {
    throw new Error(`Bundled brand image ${assetId} has no dimensions`);
  }
  return {
    assetId,
    path,
    contentType: 'image/png',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    perceptualHash: await fingerprintImage(path),
    width: metadata.width,
    height: metadata.height,
    originalImageUrl: ZAP_PILOT_SITE_URL,
    sourcePageUrl: ZAP_PILOT_SITE_URL,
    provider: 'brand',
    license: 'brand-generated',
  };
}

async function createPodcastIntroAsset(
  workingDirectory: string,
): Promise<PlannedVisualImage> {
  // Deprecated legacy asset kept for old payload compatibility (read-old / never write new)
  return createBrandAsset(
    workingDirectory,
    PODCAST_INTRO_ASSET_ID,
    videoAssetPaths.podcastIntro,
  );
}

async function createPodcastOutroAsset(
  workingDirectory: string,
): Promise<PlannedVisualImage> {
  return createBrandAsset(
    workingDirectory,
    PODCAST_OUTRO_ASSET_ID,
    videoAssetPaths.zapPilotOutro,
  );
}
