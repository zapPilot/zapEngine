import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import { contentTypeExtension } from '../../lib/content-type.js';
import { IMAGE_SEARCH_BUDGET } from './episode-image-pool.js';
import { generatedSlideMetadataSchema } from './episode-visual.js';
import {
  compactVisualSelection,
  compactVisualSelectionSchema,
  createImageSearchTrace,
} from './image-search-trace.js';
import {
  enrichedStoryboardDraftSchema,
  MAX_STORYBOARD_SLIDES,
  SCENE_ID_PATTERN,
} from './storyboard/draft.js';
import type {
  EnrichedStoryboardGenerationResult,
  StoryboardAttemptReport,
} from './storyboard/orchestrator.js';
import {
  visualSceneSubjectAssignmentSchema,
  visualSubjectCatalogSchema,
} from './storyboard/subject-catalog.js';
import type {
  PlannedVisualImage,
  VisualAssetPlan,
} from './visual-asset-planner.js';
import {
  VISUAL_ASSET_ID_PATTERN,
  visualAssetIdentityFields,
} from './visual-asset-shared.js';

/**
 * Intra-job checkpoint for the visual planner. Storyboard + search intents are
 * saved once they exist; every selected scene image is mirrored to R2 and
 * appended as it is chosen. A retry of the same visual version and source hash
 * resumes from the last selected scene instead of paying for the storyboard,
 * catalog, intents, and every earlier search again.
 */
export const VISUAL_CHECKPOINT_SCHEMA_VERSION =
  'podcast-episode-visual-checkpoint.v1' as const;

const checkpointAssetSchema = z
  .object({
    assetId: z.string().regex(VISUAL_ASSET_ID_PATTERN),
    r2Url: z.string().url(),
    contentType: z.enum([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
    ]),
    ...visualAssetIdentityFields,
    originalImageUrl: z.string().min(1),
    sourcePageUrl: z.string().min(1),
    // A checkpoint is one attempt's scratch space, not stored history: a row
    // written by a retired provider fails this parse, returns null, and the job
    // replans, so there is nothing here to keep readable.
    provider: z.enum(['article', 'brand', 'generated-slide', 'brave']),
    license: z.enum(['brand-generated', 'unknown']),
    photographer: z.string().min(1).optional(),
    photographerUrl: z.string().min(1).optional(),
    slide: generatedSlideMetadataSchema.optional(),
  })
  .strict();

const tokenUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  })
  .strict();

export const visualCheckpointSchema = z
  .object({
    schemaVersion: z.literal(VISUAL_CHECKPOINT_SCHEMA_VERSION),
    visualVersion: z.string().min(1),
    sourceHash: z.string().min(1),
    searchTitleSource: z.enum(['publisher', 'english-localization', 'none']),
    storyboard: z
      .object({
        draft: enrichedStoryboardDraftSchema,
        effectiveProvider: z.string().min(1),
        requestedProvider: z.string().min(1),
        model: z.string().min(1).nullable(),
        usedFallback: z.boolean(),
        attempts: z.array(z.record(z.string(), z.unknown())).max(8),
        totalUsage: tokenUsageSchema,
      })
      .strict(),
    searchIntentModel: z.string().min(1),
    subjectCatalog: visualSubjectCatalogSchema,
    sceneAssignments: z
      .array(visualSceneSubjectAssignmentSchema)
      .max(MAX_STORYBOARD_SLIDES),
    scenes: z
      .array(
        z
          .object({
            sceneId: z.string().regex(SCENE_ID_PATTERN),
            assetId: z.string().regex(VISUAL_ASSET_ID_PATTERN),
            selection: compactVisualSelectionSchema,
          })
          .strict(),
      )
      .max(MAX_STORYBOARD_SLIDES),
    assets: z.array(checkpointAssetSchema).max(MAX_STORYBOARD_SLIDES),
  })
  .strict();

export type VisualCheckpoint = z.infer<typeof visualCheckpointSchema>;

export interface VisualCheckpointIdentity {
  visualVersion: string;
  sourceHash: string;
}

export function buildVisualCheckpoint(input: {
  identity: VisualCheckpointIdentity;
  storyboard: EnrichedStoryboardGenerationResult;
  searchIntentModel: string;
  subjectCatalog: VisualCheckpoint['subjectCatalog'];
  sceneAssignments: VisualCheckpoint['sceneAssignments'];
  searchTitleSource: VisualCheckpoint['searchTitleSource'];
}): VisualCheckpoint {
  return {
    schemaVersion: VISUAL_CHECKPOINT_SCHEMA_VERSION,
    visualVersion: input.identity.visualVersion,
    sourceHash: input.identity.sourceHash,
    searchTitleSource: input.searchTitleSource,
    storyboard: {
      draft: input.storyboard.draft,
      effectiveProvider: input.storyboard.effectiveProvider,
      requestedProvider: input.storyboard.requestedProvider,
      model: input.storyboard.model,
      usedFallback: input.storyboard.usedFallback,
      attempts: input.storyboard.attempts.map((attempt) => ({ ...attempt })),
      totalUsage: input.storyboard.totalUsage,
    },
    searchIntentModel: input.searchIntentModel,
    subjectCatalog: input.subjectCatalog,
    sceneAssignments: [...input.sceneAssignments],
    scenes: [],
    assets: [],
  };
}

/**
 * Only a checkpoint written for the same visual version and the same source
 * hash may be resumed. Anything else (older schema, replan, script change)
 * is ignored and the job plans from scratch.
 */
export function parseVisualCheckpoint(
  value: unknown,
  identity: VisualCheckpointIdentity,
): VisualCheckpoint | null {
  const parsed = visualCheckpointSchema.safeParse(value);
  if (!parsed.success) return null;
  if (
    parsed.data.visualVersion !== identity.visualVersion ||
    parsed.data.sourceHash !== identity.sourceHash
  ) {
    return null;
  }
  return parsed.data;
}

export function appendVisualCheckpointScene(
  checkpoint: VisualCheckpoint,
  selection: {
    sceneId: string;
    asset: PlannedVisualImage;
    r2Url: string;
    selection: import('./image-search-trace.js').VisualSceneSelection;
  },
): VisualCheckpoint {
  const asset = withoutLocalPath(selection.asset);
  const record = compactVisualSelection(selection.selection);
  const alreadyStored = checkpoint.assets.some(
    (stored) => stored.assetId === asset.assetId,
  );
  return {
    ...checkpoint,
    scenes: [
      ...checkpoint.scenes.filter(
        (scene) => scene.sceneId !== selection.sceneId,
      ),
      { sceneId: selection.sceneId, assetId: asset.assetId, selection: record },
    ],
    assets: alreadyStored
      ? checkpoint.assets
      : [
          ...checkpoint.assets,
          {
            ...asset,
            r2Url: selection.r2Url,
          },
        ],
  };
}

export function restoreVisualStoryboard(
  checkpoint: VisualCheckpoint,
): EnrichedStoryboardGenerationResult {
  return {
    draft: checkpoint.storyboard.draft,
    effectiveProvider: checkpoint.storyboard.effectiveProvider,
    requestedProvider: checkpoint.storyboard.requestedProvider,
    model: checkpoint.storyboard.model,
    usedFallback: checkpoint.storyboard.usedFallback,
    attempts: checkpoint.storyboard
      .attempts as unknown as StoryboardAttemptReport[],
    totalUsage: checkpoint.storyboard.totalUsage,
  };
}

export type DownloadCheckpointImage = (
  url: string,
  path: string,
  signal: AbortSignal,
) => Promise<void>;

export class ExpiredVisualCheckpointImageError extends Error {}

export async function downloadVisualCheckpointImage(
  url: string,
  path: string,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(url, { signal });
  if (
    response.status === 404 &&
    new URL(url).pathname.startsWith('/transient/visual-checkpoints/')
  ) {
    throw new ExpiredVisualCheckpointImageError(
      'Visual checkpoint image expired',
    );
  }
  if (!response.ok) {
    throw new Error(
      `Visual checkpoint image ${url} responded ${response.status}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

/** Re-materializes the checkpointed scene images so the final upload and
 * hash steps see the same local files a fresh plan would produce. */
export async function restoreVisualCheckpointPlan(
  checkpoint: VisualCheckpoint,
  options: {
    workingDirectory: string;
    signal: AbortSignal;
    download: DownloadCheckpointImage;
  },
): Promise<VisualAssetPlan> {
  const assets: PlannedVisualImage[] = [];
  for (const stored of checkpoint.assets) {
    options.signal.throwIfAborted();
    const { r2Url, ...rest } = stored;
    const path = join(
      options.workingDirectory,
      'checkpoint',
      `${stored.assetId}.${contentTypeExtension(stored.contentType)}`,
    );
    try {
      await options.download(r2Url, path, options.signal);
    } catch (error) {
      options.signal.throwIfAborted();
      if (error instanceof ExpiredVisualCheckpointImageError) continue;
      throw error;
    }
    assets.push({ ...rest, path });
  }
  const available = new Set(assets.map((asset) => asset.assetId));
  return {
    assets,
    scenes: checkpoint.scenes
      .filter((scene) => available.has(scene.assetId))
      .map(({ sceneId, assetId }) => ({ sceneId, assetId })),
    imageSearch: {
      ...createImageSearchTrace(IMAGE_SEARCH_BUDGET, checkpoint.scenes.length),
      scenes: checkpoint.scenes
        .filter((scene) => available.has(scene.assetId))
        .map((scene) => ({
          ...scene.selection,
          sceneId: scene.sceneId,
          rejections: [],
          providerRank: scene.selection.providerRank,
          visualCue: scene.selection.visualCue,
        })),
    },
  };
}

function withoutLocalPath(
  asset: PlannedVisualImage,
): Omit<PlannedVisualImage, 'path'> {
  const copy: Partial<PlannedVisualImage> = { ...asset };
  delete copy.path;
  return copy as Omit<PlannedVisualImage, 'path'>;
}
