import { z } from 'zod';

import {
  dataCardVisualSchema,
  diagramVisualSchema,
  MAX_STORYBOARD_SLIDES,
  photoVisualSchema,
  type StoryboardDraft,
} from './draft.js';

export const HYBRID_VISUAL_PLAN_VERSION =
  'podcast-hybrid-visual-plan.v1' as const;

export const sourceLicenseSchema = z.enum([
  'brand-generated',
  'public-domain',
  'cc0',
  'cc-by-2.0',
  'cc-by-4.0',
  'cc-by-sa-4.0',
  'official-public-domain',
  'all-rights-reserved',
  'pexels',
  'pixabay',
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

const commonSceneShape = {
  sceneId: z.string().regex(/^scene-\d{2}$/),
  startSentenceId: z.string().regex(/^s\d{4}$/),
  endSentenceId: z.string().regex(/^s\d{4}$/),
};

export const materializedPhotoSceneSchema = z
  .object({
    ...commonSceneShape,
    visual: photoVisualSchema,
    actualKind: z.literal('photo'),
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

export const materializedDiagramSceneSchema = z
  .object({
    ...commonSceneShape,
    visual: diagramVisualSchema,
    actualKind: z.literal('diagram'),
    fallbackFrom: z.literal('photo').optional(),
    fallbackReason: z.string().min(1).max(120).optional(),
  })
  .strict();

export const materializedDataCardSceneSchema = z
  .object({
    ...commonSceneShape,
    visual: dataCardVisualSchema,
    actualKind: z.literal('dataCard'),
  })
  .strict();

export const materializedVisualSceneSchema = z.discriminatedUnion(
  'actualKind',
  [
    materializedPhotoSceneSchema,
    materializedDiagramSceneSchema,
    materializedDataCardSceneSchema,
  ],
);

export const hybridVisualPlanSchema = z
  .object({
    schemaVersion: z.literal(HYBRID_VISUAL_PLAN_VERSION),
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
export type HybridVisualPlan = z.infer<typeof hybridVisualPlanSchema>;
export type MaterializedVisualScene = HybridVisualPlan['scenes'][number];

export interface MaterializedPhotoAsset {
  sceneId: string;
  sources: VisualSource[];
  asset: RemoteImageAssetInput;
}

export interface PhotoMaterializationFallback {
  sceneId: string;
  reason: string;
}

export function stableSceneId(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_STORYBOARD_SLIDES) {
    throw new Error(
      `Scene index must be an integer from 0 to ${MAX_STORYBOARD_SLIDES - 1}`,
    );
  }
  return `scene-${String(index + 1).padStart(2, '0')}`;
}

export function parseHybridVisualPlan(input: unknown): HybridVisualPlan {
  return hybridVisualPlanSchema.parse(input);
}

function photoFallbackDiagram(
  scene: StoryboardDraft['scenes'][number],
  reason: string,
): MaterializedVisualScene {
  if (scene.visual.kind !== 'photo') {
    throw new Error(`Scene ${scene.sceneId} is not a photo scene`);
  }
  const nodes = scene.visual.mustShowEntities.map((label, index) => ({
    id: `entity-${index + 1}`,
    label,
  }));
  return {
    sceneId: scene.sceneId,
    startSentenceId: scene.startSentenceId,
    endSentenceId: scene.endSentenceId,
    actualKind: 'diagram',
    fallbackFrom: 'photo',
    fallbackReason: reason,
    visual: {
      kind: 'diagram',
      layout: 'entityCard',
      nodes,
      edges: [],
    },
  };
}

export function materializeHybridVisualPlan(input: {
  draft: StoryboardDraft;
  photoAssets: readonly MaterializedPhotoAsset[];
  photoFallbacks?: readonly PhotoMaterializationFallback[];
}): HybridVisualPlan {
  const photoAssetById = new Map(
    input.photoAssets.map((asset) => [asset.sceneId, asset] as const),
  );
  const fallbackById = new Map(
    (input.photoFallbacks ?? []).map(
      (fallback) => [fallback.sceneId, fallback] as const,
    ),
  );

  return parseHybridVisualPlan({
    schemaVersion: HYBRID_VISUAL_PLAN_VERSION,
    scenes: input.draft.scenes.map((scene) => {
      if (scene.visual.kind === 'diagram') {
        return { ...scene, actualKind: 'diagram' as const };
      }
      if (scene.visual.kind === 'dataCard') {
        return { ...scene, actualKind: 'dataCard' as const };
      }
      const photoAsset = photoAssetById.get(scene.sceneId);
      if (photoAsset) {
        return {
          ...scene,
          actualKind: 'photo' as const,
          sources: photoAsset.sources,
          asset: photoAsset.asset,
        };
      }
      const fallback = fallbackById.get(scene.sceneId);
      return photoFallbackDiagram(
        scene,
        fallback?.reason ?? 'no-grounded-photo',
      );
    }),
  });
}
