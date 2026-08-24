import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { ZAP_PILOT_SITE_LABEL } from '../../brand/cta.js';
import {
  podcastBrandVisualKind,
  type PodcastBrandVisualKind,
} from '../podcast-packaging.js';
import {
  fingerprintImage,
  type PlannedVisualImage,
  type PlanVisualAssetsInput,
  type VisualAssetPlan,
  type VisualAssetProgress,
  planVisualAssets,
} from './visual-asset-planner.js';

const BRAND_SOURCE_PAGE_URL =
  'https://github.com/zapPilot/zapEngine/tree/main/apps/podcast-pipeline';

export async function planPodcastVisualAssets(
  input: PlanVisualAssetsInput,
): Promise<VisualAssetPlan> {
  const contentScenes = input.scenes.filter(
    (scene) => podcastBrandVisualKind(scene.imageSearchIntent) === null,
  );
  const firstContentIndex = input.scenes.findIndex(
    (scene) => podcastBrandVisualKind(scene.imageSearchIntent) === null,
  );
  const leadingBrandSceneCount =
    firstContentIndex === -1 ? input.scenes.length : firstContentIndex;
  const originalSceneIndex = new Map(
    input.scenes.map((scene, index) => [scene.sceneId, index]),
  );
  const assets: PlannedVisualImage[] = [];
  const brandAssets = new Map<PodcastBrandVisualKind, PlannedVisualImage>();

  // Branded packaging is always placed around content by
  // applyPodcastBrandingToStoryboard. Materialize the leading card before any
  // remote image work so selecting-images progress never moves backwards.
  for (let index = 0; index < leadingBrandSceneCount; index += 1) {
    const scene = input.scenes[index];
    if (!scene) continue;
    const brandKind = podcastBrandVisualKind(scene.imageSearchIntent);
    if (brandKind === null) continue;
    const asset = await ensurePodcastBrandAsset(
      brandKind,
      brandAssets,
      assets,
      input.workingDirectory,
    );
    reportBrandAssetProgress(input, scene.sceneId, index, asset.assetId);
  }

  const contentPlan =
    contentScenes.length === 0
      ? { assets: [], scenes: [] }
      : await planVisualAssets({
          ...input,
          scenes: contentScenes,
          onProgress: input.onProgress
            ? (progress) =>
                input.onProgress?.(
                  remapProgress(
                    progress,
                    originalSceneIndex,
                    input.scenes.length,
                  ),
                )
            : undefined,
        });
  assets.push(...contentPlan.assets);

  const sceneAssetId = new Map(
    contentPlan.scenes.map((scene) => [scene.sceneId, scene.assetId]),
  );
  const scenes: VisualAssetPlan['scenes'] = [];

  for (const [sceneIndex, scene] of input.scenes.entries()) {
    input.signal?.throwIfAborted();
    const brandKind = podcastBrandVisualKind(scene.imageSearchIntent);
    if (brandKind === null) {
      const assetId = sceneAssetId.get(scene.sceneId);
      if (!assetId) {
        throw new Error(`Content scene ${scene.sceneId} has no planned asset`);
      }
      scenes.push({ sceneId: scene.sceneId, assetId });
      continue;
    }

    const asset = await ensurePodcastBrandAsset(
      brandKind,
      brandAssets,
      assets,
      input.workingDirectory,
    );
    scenes.push({ sceneId: scene.sceneId, assetId: asset.assetId });
    if (sceneIndex >= leadingBrandSceneCount) {
      reportBrandAssetProgress(input, scene.sceneId, sceneIndex, asset.assetId);
    }
  }

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
    provider: 'article',
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

async function ensurePodcastBrandAsset(
  kind: PodcastBrandVisualKind,
  brandAssets: Map<PodcastBrandVisualKind, PlannedVisualImage>,
  assets: PlannedVisualImage[],
  workingDirectory: string,
): Promise<PlannedVisualImage> {
  const existing = brandAssets.get(kind);
  if (existing) return existing;
  const created = await createPodcastBrandAsset(kind, workingDirectory);
  brandAssets.set(kind, created);
  assets.push(created);
  return created;
}

async function createPodcastBrandAsset(
  kind: PodcastBrandVisualKind,
  workingDirectory: string,
): Promise<PlannedVisualImage> {
  await mkdir(workingDirectory, { recursive: true });
  // The persisted visual payload intentionally keeps its existing image-XX
  // asset contract. Content scenes are capped at 62, so 98/99 cannot collide
  // with search-planned image IDs.
  const assetId = kind === 'intro' ? 'image-98' : 'image-99';
  const path = join(workingDirectory, `${assetId}.png`);
  const rendered = await sharp(Buffer.from(brandSvg(kind)))
    .png()
    .toBuffer({ resolveWithObject: true });
  await writeFile(path, rendered.data);

  return {
    assetId,
    path,
    contentType: 'image/png',
    sha256: createHash('sha256').update(rendered.data).digest('hex'),
    perceptualHash: await fingerprintImage(path),
    width: rendered.info.width,
    height: rendered.info.height,
    originalImageUrl: `${BRAND_SOURCE_PAGE_URL}?brand=${kind}`,
    sourcePageUrl: BRAND_SOURCE_PAGE_URL,
    // Keep the existing manifest provider union unchanged. These assets are
    // generated locally and never pass through article/search acquisition.
    provider: 'article',
    license: 'unknown',
  };
}

function brandSvg(kind: PodcastBrandVisualKind): string {
  if (kind === 'intro') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0b1020"/>
          <stop offset="1" stop-color="#171f38"/>
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bg)"/>
      <circle cx="1325" cy="190" r="210" fill="#ffffff" opacity="0.05"/>
      <circle cx="230" cy="760" r="280" fill="#ffffff" opacity="0.035"/>
      <text x="120" y="395" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="112" font-weight="700" letter-spacing="8">ZAP PODCAST</text>
      <text x="126" y="475" fill="#cbd5e1" font-family="Arial, Helvetica, sans-serif" font-size="34" letter-spacing="5">FROM FED TO CHAIN</text>
      <rect x="126" y="535" width="180" height="8" rx="4" fill="#ffffff" opacity="0.9"/>
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
    <defs>
      <linearGradient id="bg" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stop-color="#0a0f1f"/>
        <stop offset="1" stop-color="#1d2947"/>
      </linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#bg)"/>
    <rect x="110" y="130" width="1380" height="640" rx="44" fill="#ffffff" opacity="0.055"/>
    <text x="160" y="345" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="108" font-weight="700" letter-spacing="9">ZAP PILOT</text>
    <text x="166" y="455" fill="#dbe4f0" font-family="Arial, Helvetica, sans-serif" font-size="46">Manage your portfolio, not just a wallet.</text>
    <text x="166" y="590" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="600">${ZAP_PILOT_SITE_LABEL}</text>
  </svg>`;
}
