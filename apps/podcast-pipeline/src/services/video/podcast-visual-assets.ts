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

if (MAX_STORYBOARD_SLIDES >= 98) {
  throw new Error('Podcast intro asset ID collides with storyboard assets');
}

export async function planPodcastVisualAssets(
  input: PlanVisualAssetsInput,
): Promise<VisualAssetPlan> {
  const introScene = input.scenes.find(
    (scene) => podcastBrandVisualKind(scene.imageSearchIntent) === 'intro',
  );
  const contentScenes = input.scenes.filter(
    (scene) => podcastBrandVisualKind(scene.imageSearchIntent) === null,
  );
  const originalSceneIndex = new Map(
    input.scenes.map((scene, index) => [scene.sceneId, index]),
  );
  const assets: PlannedVisualImage[] = [];

  if (introScene) {
    const introAsset = await createPodcastIntroAsset(input.workingDirectory);
    assets.push(introAsset);
    reportBrandAssetProgress(
      input,
      introScene.sceneId,
      originalSceneIndex.get(introScene.sceneId) ?? 0,
    );
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
    if (podcastBrandVisualKind(scene.imageSearchIntent) === 'intro') {
      return { sceneId: scene.sceneId, assetId: PODCAST_INTRO_ASSET_ID };
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
): void {
  input.onProgress?.({
    phase: 'assets',
    sceneId,
    sceneIndex: sceneIndex + 1,
    sceneCount: input.scenes.length,
    provider: 'brand',
    assetId: PODCAST_INTRO_ASSET_ID,
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
