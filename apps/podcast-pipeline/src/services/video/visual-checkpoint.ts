import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { z } from 'zod';

import { contentTypeExtension } from '../../lib/content-type.js';
import { generatedSlideMetadataSchema } from './episode-visual.js';
import { storyboardDraftSchema } from './storyboard/draft.js';
import type {
  StoryboardAttemptReport,
  StoryboardGenerationResult,
} from './storyboard/orchestrator.js';
import {
  visualSceneSubjectAssignmentSchema,
  visualSubjectCatalogSchema,
} from './storyboard/subject-catalog.js';
import type {
  PlannedVisualImage,
  VisualAssetPlan,
} from './visual-asset-planner.js';
import { visualAssetIdentityFields } from './visual-asset-shared.js';

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
    assetId: z.string().regex(/^image-\d{2}$/),
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
        draft: storyboardDraftSchema,
        effectiveProvider: z.string().min(1),
        requestedProvider: z.string().min(1),
        model: z.string().min(1).nullable(),
        usedFallback: z.boolean(),
        attempts: z.array(z.record(z.string(), z.unknown())).max(8),
        totalUsage: tokenUsageSchema,
      })
      .strict(),
    searchIntentModel: z.string().min(1).nullable(),
    subjectCatalog: visualSubjectCatalogSchema.nullable(),
    /** Why this attempt has no catalog, when enrichment degraded rather than
     * simply finding no named subject. Optional so a checkpoint written before
     * the field existed still parses and its job resumes instead of replanning;
     * absent otherwise, because a retry that reports no reason is misleading. */
    subjectCatalogFailure: z.string().min(1).optional(),
    sceneAssignments: z.array(visualSceneSubjectAssignmentSchema).max(64),
    scenes: z
      .array(
        z
          .object({
            sceneId: z.string().regex(/^scene-\d{2}$/),
            assetId: z.string().regex(/^image-\d{2}$/),
          })
          .strict(),
      )
      .max(64),
    assets: z.array(checkpointAssetSchema).max(64),
  })
  .strict();

export type VisualCheckpoint = z.infer<typeof visualCheckpointSchema>;

export interface VisualCheckpointIdentity {
  visualVersion: string;
  sourceHash: string;
}

export function buildVisualCheckpoint(input: {
  identity: VisualCheckpointIdentity;
  storyboard: StoryboardGenerationResult;
  searchIntentModel: string | null;
  subjectCatalog: VisualCheckpoint['subjectCatalog'];
  subjectCatalogFailure: string | null;
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
    ...(input.subjectCatalogFailure
      ? { subjectCatalogFailure: input.subjectCatalogFailure }
      : {}),
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
  selection: { sceneId: string; asset: PlannedVisualImage; r2Url: string },
): VisualCheckpoint {
  const asset = withoutLocalPath(selection.asset);
  const alreadyStored = checkpoint.assets.some(
    (stored) => stored.assetId === asset.assetId,
  );
  return {
    ...checkpoint,
    scenes: [
      ...checkpoint.scenes.filter(
        (scene) => scene.sceneId !== selection.sceneId,
      ),
      { sceneId: selection.sceneId, assetId: asset.assetId },
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
): StoryboardGenerationResult {
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

export async function downloadVisualCheckpointImage(
  url: string,
  path: string,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(url, { signal });
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
    await options.download(r2Url, path, options.signal);
    assets.push({ ...rest, path });
  }
  return { assets, scenes: [...checkpoint.scenes] };
}

function withoutLocalPath(
  asset: PlannedVisualImage,
): Omit<PlannedVisualImage, 'path'> {
  const copy: Partial<PlannedVisualImage> = { ...asset };
  delete copy.path;
  return copy as Omit<PlannedVisualImage, 'path'>;
}
