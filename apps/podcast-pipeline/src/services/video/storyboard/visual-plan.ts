import { z } from 'zod';

import { MAX_STORYBOARD_SLIDES, type StoryboardDraft } from './draft.js';

export const IMAGE_VISUAL_PLAN_VERSION =
  'podcast-image-visual-plan.v1' as const;

export const sourceLicenseSchema = z.enum([
  'brand-generated',
  'public-domain',
  'cc0',
  'cc-by-2.0',
  'cc-by-4.0',
  'cc-by-sa-4.0',
  'official-public-domain',
  'all-rights-reserved',
  'unknown',
]);

export const visualSourceSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    url: z.string().url().nullable(),
    attribution: z.string().min(1),
    license: sourceLicenseSchema,
    licenseUrl: z.string().url().nullable(),
  })
  .strict();

export const remoteImageAssetSchema = z
  .object({
    kind: z.literal('remoteImage'),
    sourceId: z.string().min(1),
    url: z.string().url(),
    sha256: z.string().regex(/^[a-f\d]{64}$/),
    layout: z.literal('fullBleed'),
    position: z.enum(['center', 'top', 'bottom']).default('center'),
  })
  .strict();

export const materializedVisualSceneSchema = z
  .object({
    sceneId: z.string().regex(/^scene-\d{2}$/),
    startSentenceId: z.string().regex(/^s\d{4}$/),
    endSentenceId: z.string().regex(/^s\d{4}$/),
    imageSearchIntent: z.array(z.string().min(2).max(80)).min(1).max(3),
    sources: z.array(visualSourceSchema).min(1),
    asset: remoteImageAssetSchema,
  })
  .strict()
  .superRefine((scene, context) => {
    if (!scene.sources.some((source) => source.id === scene.asset.sourceId)) {
      context.addIssue({
        code: 'custom',
        message: `Asset source ${scene.asset.sourceId} is missing from scene sources`,
        path: ['asset', 'sourceId'],
      });
    }
  });

export const imageVisualPlanSchema = z
  .object({
    schemaVersion: z.literal(IMAGE_VISUAL_PLAN_VERSION),
    scenes: z
      .array(materializedVisualSceneSchema)
      .min(1)
      .max(MAX_STORYBOARD_SLIDES),
  })
  .strict()
  .superRefine((plan, context) => {
    let expectedStartSentence = 1;
    plan.scenes.forEach((scene, index) => {
      const expectedSceneId = stableSceneId(index);
      if (scene.sceneId !== expectedSceneId) {
        context.addIssue({
          code: 'custom',
          message: `Scene ${index + 1} must use stable ID ${expectedSceneId}`,
          path: ['scenes', index, 'sceneId'],
        });
      }
      const startSentence = Number(scene.startSentenceId.slice(1));
      const endSentence = Number(scene.endSentenceId.slice(1));
      if (startSentence !== expectedStartSentence) {
        context.addIssue({
          code: 'custom',
          message: `Scene ${scene.sceneId} must start at s${String(expectedStartSentence).padStart(4, '0')}`,
          path: ['scenes', index, 'startSentenceId'],
        });
      }
      if (endSentence < startSentence) {
        context.addIssue({
          code: 'custom',
          message: `Scene ${scene.sceneId} has a reversed sentence range`,
          path: ['scenes', index, 'endSentenceId'],
        });
      } else {
        expectedStartSentence = endSentence + 1;
      }
    });
  });

export type VisualSource = z.infer<typeof visualSourceSchema>;
export type RemoteImageAssetInput = z.input<typeof remoteImageAssetSchema>;

export type ImageVisualPlan = z.infer<typeof imageVisualPlanSchema>;

export interface MaterializedSceneAsset {
  sceneId: string;
  sources: VisualSource[];
  asset: RemoteImageAssetInput;
}

export function stableSceneId(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_STORYBOARD_SLIDES) {
    throw new Error(
      `Scene index must be an integer from 0 to ${MAX_STORYBOARD_SLIDES - 1}`,
    );
  }
  return `scene-${String(index + 1).padStart(2, '0')}`;
}

export function parseImageVisualPlan(input: unknown): ImageVisualPlan {
  return imageVisualPlanSchema.parse(input);
}

export function materializeImageVisualPlan(input: {
  draft: StoryboardDraft;
  sceneAssets: readonly MaterializedSceneAsset[];
}): ImageVisualPlan {
  if (input.sceneAssets.length !== input.draft.scenes.length) {
    throw new Error(
      `Expected ${input.draft.scenes.length} materialized scene assets, received ${input.sceneAssets.length}`,
    );
  }

  const sceneAssetById = new Map(
    input.sceneAssets.map(
      (sceneAsset) => [sceneAsset.sceneId, sceneAsset] as const,
    ),
  );
  if (sceneAssetById.size !== input.sceneAssets.length) {
    throw new Error('Materialized scene assets contain duplicate scene IDs');
  }

  return parseImageVisualPlan({
    schemaVersion: IMAGE_VISUAL_PLAN_VERSION,
    scenes: input.draft.scenes.map((scene) => {
      const sceneAsset = sceneAssetById.get(scene.sceneId);
      if (!sceneAsset) {
        throw new Error(`Materialized image is missing for ${scene.sceneId}`);
      }
      return {
        ...scene,
        sources: sceneAsset.sources,
        asset: sceneAsset.asset,
      };
    }),
  });
}
