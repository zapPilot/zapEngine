import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { ZAP_PILOT_SITE_URL } from '../../brand/cta.js';
import { podcastBrandVisualKind } from '../podcast-packaging.js';
import { createGeneratedSlideAsset } from './generated-slide.js';
import { videoAssetPaths } from './runtime-assets.js';
import {
  MAX_SEARCH_INTENTS_PER_SCENE,
  MAX_STORYBOARD_SLIDES,
} from './storyboard/draft.js';
import { sceneSearchEntities } from './storyboard/search-intents.js';
import {
  buildVisualSubjectSearchQueries,
  type VisualSceneSubjectAssignment,
  type VisualSubjectCatalog,
  visualSubjectsForScene,
} from './storyboard/subject-catalog.js';
import {
  fingerprintImage,
  type PlannedVisualImage,
  planVisualAssets,
  type PlanVisualAssetsInput,
  type VisualAssetPlan,
  type VisualAssetProgress,
  type VisualAssetScene,
} from './visual-asset-planner.js';

const PODCAST_INTRO_ASSET_ID = 'image-98';
const PODCAST_OUTRO_ASSET_ID = 'image-99';

if (MAX_STORYBOARD_SLIDES >= 98) {
  throw new Error('Podcast intro asset ID collides with storyboard assets');
}
if (MAX_STORYBOARD_SLIDES >= 99) {
  throw new Error('Podcast outro asset ID collides with storyboard assets');
}

export interface PodcastVisualAssetPlanInput extends PlanVisualAssetsInput {
  /** Absent when the catalog step produced nothing to anchor on. The episode
   * then searches the storyboard's own deterministic intents instead of
   * failing: a weaker query still renders a video. */
  subjectCatalog?: VisualSubjectCatalog;
  sceneAssignments?: readonly VisualSceneSubjectAssignment[];
}

/**
 * The podcast layer around the planner: the bundled intro/outro frames are
 * copied straight from disk, and everything else is one `planVisualAssets`
 * call over the content scenes so the whole episode shares a single Brave
 * budget and a single candidate pool.
 */
export async function planPodcastVisualAssets(
  input: PodcastVisualAssetPlanInput,
): Promise<VisualAssetPlan> {
  const dependencies = {
    ...input.dependencies,
    generateSlide:
      input.dependencies?.generateSlide ?? createGeneratedSlideAsset,
  };
  const { assets, contentScenes, originalSceneIndex } =
    await preparePodcastVisualAssets(input);
  if (contentScenes.length === 0) {
    return { assets, scenes: mapScenesWithBrand(input.scenes, new Map()) };
  }

  const searchScenes = contentScenesForPlanning(input, contentScenes);
  const contentPlan = await planVisualAssets({
    scenes: searchScenes,
    articleImages: input.articleImages,
    workingDirectory: input.workingDirectory,
    ...(input.resumePlan
      ? { resumePlan: resumePlanForScenes(input.resumePlan, searchScenes) }
      : {}),
    selectionMode: input.selectionMode,
    signal: input.signal,
    slideFallback: input.slideFallback,
    onSelection: input.onSelection,
    dependencies,
    onProgress: remappedProgressHandler(
      input.onProgress,
      originalSceneIndex,
      input.scenes.length,
    ),
  });
  assets.push(...contentPlan.assets);
  const assetByScene = new Map(
    contentPlan.scenes.map((scene) => [scene.sceneId, scene.assetId] as const),
  );
  return {
    assets,
    scenes: mapScenesWithBrand(input.scenes, assetByScene),
    ...(contentPlan.imageSearch
      ? { imageSearch: contentPlan.imageSearch }
      : {}),
  };
}

/**
 * The subject catalog replaces the storyboard's own intents with disambiguated
 * subject queries. Without one the storyboard intents are all the episode has,
 * so the enrich-versus-plan invariants below only hold on the catalog path.
 */
function contentScenesForPlanning(
  input: PodcastVisualAssetPlanInput,
  contentScenes: readonly VisualAssetScene[],
): VisualAssetScene[] {
  const { subjectCatalog, sceneAssignments } = input;
  if (!subjectCatalog || !sceneAssignments) return [...contentScenes];

  const assignmentBySceneId = new Map(
    sceneAssignments.map((assignment) => [assignment.sceneId, assignment]),
  );
  const leadAssignment = assignmentBySceneId.get(contentScenes[0]!.sceneId);
  if (leadAssignment?.subjectIds[0] !== subjectCatalog.primarySubjectId) {
    throw new Error(
      `Lead visual must be anchored to primary subject ${subjectCatalog.primarySubjectId}`,
    );
  }

  return contentScenes.map((scene) => {
    const assignment = assignmentBySceneId.get(scene.sceneId);
    if (!assignment) {
      throw new Error(
        `Visual subject assignment is missing for ${scene.sceneId}`,
      );
    }
    return subjectAnchoredScene(subjectCatalog, assignment, scene);
  });
}

function subjectAnchoredScene(
  catalog: VisualSubjectCatalog,
  assignment: VisualSceneSubjectAssignment,
  scene: VisualAssetScene,
): VisualAssetScene {
  const subjects = visualSubjectsForScene(catalog, assignment);
  if (subjects.length === 0) {
    throw new Error(`Visual subjects are missing for ${scene.sceneId}`);
  }
  return {
    ...scene,
    imageSearchIntent: [
      ...new Set(subjects.flatMap(buildVisualSubjectSearchQueries)),
    ].slice(0, MAX_SEARCH_INTENTS_PER_SCENE),
    // Subject names rank a candidate that names the subject above one that does
    // not; they no longer decide whether it may be downloaded at all.
    imageSearchEntities: sceneSearchEntities(subjects),
    // Only a scene that cites its subject in its own sentences is worth a
    // targeted request of its own; an inherited subject has no such claim.
    searchAnchor:
      assignment.selectionReason === 'direct' ? 'direct' : 'context',
  };
}

async function preparePodcastVisualAssets(
  input: PlanVisualAssetsInput,
): Promise<{
  assets: PlannedVisualImage[];
  contentScenes: PlanVisualAssetsInput['scenes'];
  originalSceneIndex: Map<string, number>;
}> {
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
      assets.push(await createPodcastIntroAsset(input.workingDirectory));
      reportBrandAssetProgress(
        input,
        brandScene.sceneId,
        originalSceneIndex.get(brandScene.sceneId) ?? 0,
        PODCAST_INTRO_ASSET_ID,
      );
    } else if (kind === 'outro') {
      assets.push(await createPodcastOutroAsset(input.workingDirectory));
      reportBrandAssetProgress(
        input,
        brandScene.sceneId,
        originalSceneIndex.get(brandScene.sceneId) ?? 0,
        PODCAST_OUTRO_ASSET_ID,
      );
    }
  }

  return { assets, contentScenes, originalSceneIndex };
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

function resumePlanForScenes(
  plan: VisualAssetPlan,
  scenes: readonly { sceneId: string }[],
): VisualAssetPlan {
  const sceneIds = new Set(scenes.map((scene) => scene.sceneId));
  const resumedScenes = plan.scenes.filter((scene) =>
    sceneIds.has(scene.sceneId),
  );
  const assetIds = new Set(resumedScenes.map((scene) => scene.assetId));
  return {
    scenes: resumedScenes,
    assets: plan.assets.filter((asset) => assetIds.has(asset.assetId)),
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
