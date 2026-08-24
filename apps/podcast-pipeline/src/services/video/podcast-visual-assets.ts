import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { ZAP_PILOT_SITE_URL } from '../../brand/cta.js';
import { podcastBrandVisualKind } from '../podcast-packaging.js';
import { videoAssetPaths } from './runtime-assets.js';
import { MAX_STORYBOARD_SLIDES } from './storyboard/draft.js';
import {
  fingerprintImage,
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

  const contentAssetByScene = new Map(
    contentPlan.scenes.map((scene) => [scene.sceneId, scene.assetId]),
  );
  const scenes = input.scenes.map((scene) => {
    const kind = podcastBrandVisualKind(scene.imageSearchIntent);
    if (kind === 'intro') {
      return { sceneId: scene.sceneId, assetId: PODCAST_INTRO_ASSET_ID };
    }
    if (kind === 'outro') {
      return { sceneId: scene.sceneId, assetId: PODCAST_OUTRO_ASSET_ID };
    }
    const assetId = contentAssetByScene.get(scene.sceneId);
    if (!assetId) {
      throw new Error(`Content scene ${scene.sceneId} has no planned asset`);
    }
    return { sceneId: scene.sceneId, assetId };
  });

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

async function createPodcastIntroAsset(
  workingDirectory: string,
): Promise<PlannedVisualImage> {
  // Deprecated legacy asset kept for old payload compatibility (read-old / never write new)
  await mkdir(workingDirectory, { recursive: true });
  const path = join(workingDirectory, `${PODCAST_INTRO_ASSET_ID}.png`);
  await copyFile(videoAssetPaths.podcastIntro, path);
  const [bytes, metadata] = await Promise.all([
    readFile(path),
    sharp(path).metadata(),
  ]);
  if (!metadata.width || !metadata.height) {
    throw new Error('Bundled podcast intro image has no dimensions');
  }

  return {
    assetId: PODCAST_INTRO_ASSET_ID,
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

async function createPodcastOutroAsset(
  workingDirectory: string,
): Promise<PlannedVisualImage> {
  await mkdir(workingDirectory, { recursive: true });
  const path = join(workingDirectory, `${PODCAST_OUTRO_ASSET_ID}.png`);
  await copyFile(videoAssetPaths.zapPilotOutro, path);
  const [bytes, metadata] = await Promise.all([
    readFile(path),
    sharp(path).metadata(),
  ]);
  if (!metadata.width || !metadata.height) {
    throw new Error('Bundled Zap Pilot outro image has no dimensions');
  }

  return {
    assetId: PODCAST_OUTRO_ASSET_ID,
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

export async function selectCoverAssetForFirstScene(): Promise<void> {
  // Placeholder for isolated cover selector — full implementation uses deterministic scoring.
  // Best-effort: see visual-asset-planner cover ranking.
}
