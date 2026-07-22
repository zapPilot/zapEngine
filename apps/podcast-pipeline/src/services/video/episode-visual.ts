import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { StoryboardGenerationResult } from './storyboard/orchestrator.js';
import {
  type ImageVisualPlan,
  imageVisualPlanSchema,
  materializeImageVisualPlan,
} from './storyboard/visual-plan.js';
import type {
  PlannedVisualImage,
  PlannedVisualScene,
} from './visual-asset-planner.js';

export const EPISODE_VISUAL_PAYLOAD_SCHEMA_VERSION =
  'podcast-episode-visual.v1' as const;
export const EPISODE_VISUAL_STORYBOARD_PROMPT_VERSION =
  'image-storyboard-v2' as const;

const visualAssetMetadataSchema = z
  .object({
    assetId: z.string().regex(/^image-\d{2}$/),
    r2Url: z.string().url(),
    originalImageUrl: z.string().url(),
    sourcePageUrl: z.string().url(),
    provider: z.enum(['article', 'bing']),
    license: z.literal('unknown'),
    contentType: z.enum([
      'image/avif',
      'image/jpeg',
      'image/png',
      'image/webp',
    ]),
    sha256: z.string().regex(/^[a-f\d]{64}$/),
    perceptualHash: z.string().regex(/^[a-f\d]{16}$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export const episodeVisualPayloadSchema = z
  .object({
    schemaVersion: z.literal(EPISODE_VISUAL_PAYLOAD_SCHEMA_VERSION),
    visualVersion: z.string().min(1),
    visualHash: z.string().regex(/^[a-f\d]{64}$/),
    episodeId: z.string().uuid(),
    canonicalLocalizationId: z.string().uuid(),
    manifestUrl: z.string().url(),
    visualPlan: imageVisualPlanSchema,
    assets: z.array(visualAssetMetadataSchema).min(1),
    provenance: z
      .object({
        storyboardProvider: z.string().min(1),
        storyboardModel: z.string().min(1).nullable(),
        storyboardPromptVersion: z.literal(
          EPISODE_VISUAL_STORYBOARD_PROMPT_VERSION,
        ),
        usedFallback: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((payload, context) => {
    const assetsByUrl = new Map(
      payload.assets.map((asset) => [asset.r2Url, asset] as const),
    );
    if (assetsByUrl.size !== payload.assets.length) {
      context.addIssue({
        code: 'custom',
        message: 'Visual assets must use unique R2 URLs',
        path: ['assets'],
      });
    }
    for (const [index, scene] of payload.visualPlan.scenes.entries()) {
      const asset = assetsByUrl.get(scene.asset.url);
      if (asset?.sha256 !== scene.asset.sha256) {
        context.addIssue({
          code: 'custom',
          message: `Scene ${scene.sceneId} references an unknown visual asset`,
          path: ['visualPlan', 'scenes', index, 'asset'],
        });
      }
    }
  });

export type EpisodeVisualPayload = z.infer<typeof episodeVisualPayloadSchema>;

export function parseEpisodeVisualPayload(
  input: unknown,
): EpisodeVisualPayload {
  return episodeVisualPayloadSchema.parse(input);
}

export function hashEpisodeVisualSelection(input: {
  visualVersion: string;
  episodeId: string;
  canonicalLocalizationId: string;
  scenes: readonly {
    sceneId: string;
    startSentenceId: string;
    endSentenceId: string;
    imageSearchIntent: readonly string[];
  }[];
  selectedScenes: readonly PlannedVisualScene[];
  assets: readonly PlannedVisualImage[];
}): string {
  const hashInput = {
    visualVersion: input.visualVersion,
    episodeId: input.episodeId,
    canonicalLocalizationId: input.canonicalLocalizationId,
    scenes: input.scenes,
    selectedScenes: input.selectedScenes,
    assets: input.assets.map((asset) => ({
      assetId: asset.assetId,
      contentType: asset.contentType,
      sha256: asset.sha256,
      perceptualHash: asset.perceptualHash,
      width: asset.width,
      height: asset.height,
      originalImageUrl: asset.originalImageUrl,
      sourcePageUrl: asset.sourcePageUrl,
      provider: asset.provider,
      license: asset.license,
    })),
  };
  return createHash('sha256').update(JSON.stringify(hashInput)).digest('hex');
}

export function buildEpisodeVisualPayload(input: {
  visualVersion: string;
  visualHash: string;
  episodeId: string;
  canonicalLocalizationId: string;
  manifestUrl: string;
  storyboard: StoryboardGenerationResult;
  selectedScenes: readonly PlannedVisualScene[];
  assets: readonly PlannedVisualImage[];
  r2ImageUrls: Readonly<Record<string, string>>;
}): EpisodeVisualPayload {
  const assetById = new Map(
    input.assets.map((asset) => [asset.assetId, asset] as const),
  );
  const sceneAssetById = new Map(
    input.selectedScenes.map(
      (scene) => [scene.sceneId, scene.assetId] as const,
    ),
  );
  const visualPlan: ImageVisualPlan = materializeImageVisualPlan({
    draft: input.storyboard.draft,
    sceneAssets: input.storyboard.draft.scenes.map((scene, index) => {
      const assetId = sceneAssetById.get(scene.sceneId);
      const asset = assetId ? assetById.get(assetId) : undefined;
      const r2Url = assetId ? input.r2ImageUrls[assetId] : undefined;
      if (!assetId || !asset || !r2Url) {
        throw new Error(`Visual image is missing for ${scene.sceneId}`);
      }
      const sourceId = `${assetId}-source`;
      return {
        sceneId: scene.sceneId,
        sources: [
          {
            id: sourceId,
            label: sourceLabel(asset.sourcePageUrl),
            url: asset.sourcePageUrl,
            attribution: `Image source · ${sourceLabel(asset.sourcePageUrl)}`,
            license: 'unknown' as const,
            licenseUrl: null,
          },
        ],
        asset: {
          kind: 'remoteImage' as const,
          sourceId,
          url: r2Url,
          sha256: asset.sha256,
          layout: 'fullBleed' as const,
          position: (['center', 'top', 'bottom'] as const)[index % 3],
        },
      };
    }),
  });

  return parseEpisodeVisualPayload({
    schemaVersion: EPISODE_VISUAL_PAYLOAD_SCHEMA_VERSION,
    visualVersion: input.visualVersion,
    visualHash: input.visualHash,
    episodeId: input.episodeId,
    canonicalLocalizationId: input.canonicalLocalizationId,
    manifestUrl: input.manifestUrl,
    visualPlan,
    assets: input.assets.map((asset) => {
      const r2Url = input.r2ImageUrls[asset.assetId];
      if (!r2Url) {
        throw new Error(`Uploaded image URL is missing for ${asset.assetId}`);
      }
      return {
        assetId: asset.assetId,
        r2Url,
        originalImageUrl: asset.originalImageUrl,
        sourcePageUrl: asset.sourcePageUrl,
        provider: asset.provider,
        license: asset.license,
        contentType: asset.contentType,
        sha256: asset.sha256,
        perceptualHash: asset.perceptualHash,
        width: asset.width,
        height: asset.height,
      };
    }),
    provenance: {
      storyboardProvider: input.storyboard.effectiveProvider,
      storyboardModel: input.storyboard.model,
      storyboardPromptVersion: EPISODE_VISUAL_STORYBOARD_PROMPT_VERSION,
      usedFallback: input.storyboard.usedFallback,
    },
  });
}

function sourceLabel(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return 'image source';
  }
}
