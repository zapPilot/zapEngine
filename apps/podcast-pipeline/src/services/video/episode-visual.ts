import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { StoryboardDraft } from './storyboard/draft.js';
import type { StoryboardGenerationResult } from './storyboard/orchestrator.js';
import {
  canonicalSentenceRangeText,
  splitCanonicalSentences,
} from './storyboard/sentences.js';
import {
  type VisualSceneSubjectAssignment,
  visualSceneSubjectAssignmentSchema,
  type VisualSubjectCatalog,
  visualSubjectCatalogSchema,
} from './storyboard/subject-catalog.js';
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

const generatedSlideMetadataSchema = z
  .object({
    templateVersion: z.literal('concept-card-v1'),
    kicker: z.string().min(1).max(24),
    headline: z.string().min(1).max(42),
    points: z.array(z.string().min(1).max(48)).min(2).max(3),
    copySource: z.enum(['llm', 'deterministic']),
    model: z.string().min(1).nullable(),
    reason: z.enum([
      'search-failure',
      'candidate-exhaustion',
      'reuse-dead-end',
      'never-searched',
    ]),
    rejectionSummary: z.string().nullable(),
    lead: z.boolean(),
    costUsd: z.number().nonnegative().nullable(),
  })
  .strict();

const visualAssetMetadataSchema = z
  .object({
    assetId: z.string().regex(/^image-\d{2}$/),
    r2Url: z.string().url(),
    originalImageUrl: z.string().url(),
    sourcePageUrl: z.string().url(),
    // `bing` is retired as a source but stays readable: payloads written before
    // the Brave migration are still parsed when their episode is re-rendered.
    provider: z.enum([
      'article',
      'brand',
      'pexels',
      'pixabay',
      'brave',
      'bing',
      'generated-slide',
    ]),
    license: z.enum(['brand-generated', 'unknown', 'pexels', 'pixabay']),
    photographer: z.string().min(1).optional(),
    photographerUrl: z.string().url().optional(),
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
    slide: generatedSlideMetadataSchema.optional(),
  })
  .strict();

export const visualSearchTraceEntrySchema = z
  .object({
    sceneId: z.string().regex(/^scene-\d{2}$/),
    provider: z.enum(['pexels', 'pixabay', 'brave']),
    intent: z.string().min(1).max(200),
    subjectKey: z.string().min(1).max(320).nullable(),
    returned: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    entityFiltered: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  })
  .strict();

export type VisualSearchTraceEntry = z.infer<
  typeof visualSearchTraceEntrySchema
>;

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
    // Optional keeps stored v1 payloads readable. Fresh visual-v8+ payloads
    // write both fields so the editorial decision can be audited later.
    subjectCatalog: visualSubjectCatalogSchema.optional(),
    sceneAssignments: z.array(visualSceneSubjectAssignmentSchema).optional(),
    provenance: z
      .object({
        storyboardProvider: z.string().min(1),
        storyboardModel: z.string().min(1).nullable(),
        storyboardPromptVersion: z.literal(
          EPISODE_VISUAL_STORYBOARD_PROMPT_VERSION,
        ),
        usedFallback: z.boolean(),
        // Null means every scene kept its deterministic search intent, so a
        // payload can never imply a model that shaped nothing.
        searchIntentModel: z.string().min(1).nullable(),
        // v9 audit fields are optional so stored v1-v8 payloads remain readable.
        searchTitleSource: z
          .enum(['publisher', 'english-localization', 'none'])
          .optional(),
        articleImageCandidateCount: z.number().int().nonnegative().optional(),
        articleImageAssetCount: z.number().int().nonnegative().optional(),
        searchTrace: z.array(visualSearchTraceEntrySchema).max(256).optional(),
        sceneSentences: z
          .array(
            z
              .object({
                sceneId: z.string().regex(/^scene-\d{2}$/),
                text: z.string().min(1).max(400),
              })
              .strict(),
          )
          .max(64)
          .optional(),
        generatedSlideCount: z.number().int().nonnegative().optional(),
        generatedSlideSceneIds: z
          .array(z.string().regex(/^scene-\d{2}$/))
          .max(64)
          .optional(),
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

    const usageByUrl = new Map<string, number>();
    for (const scene of payload.visualPlan.scenes) {
      usageByUrl.set(scene.asset.url, (usageByUrl.get(scene.asset.url) ?? 0) + 1);
    }
    for (const [index, asset] of payload.assets.entries()) {
      const generated = asset.provider === 'generated-slide';
      if (generated !== Boolean(asset.slide)) {
        context.addIssue({
          code: 'custom',
          message: 'Generated slide provider and metadata must appear together',
          path: ['assets', index, 'slide'],
        });
      }
      if (generated && asset.contentType !== 'image/png') {
        context.addIssue({
          code: 'custom',
          message: 'Generated slide assets must be PNG',
          path: ['assets', index, 'contentType'],
        });
      }
      if (generated && (usageByUrl.get(asset.r2Url) ?? 0) !== 1) {
        context.addIssue({
          code: 'custom',
          message: 'Generated slide assets must be scene-specific',
          path: ['assets', index, 'r2Url'],
        });
      }
    }

    if (payload.subjectCatalog || payload.sceneAssignments) {
      if (!payload.subjectCatalog || !payload.sceneAssignments) {
        context.addIssue({
          code: 'custom',
          message:
            'Visual subject catalog and scene assignments must be stored together',
          path: ['subjectCatalog'],
        });
        return;
      }
      const subjectIds = new Set(
        payload.subjectCatalog.subjects.map((subject) => subject.id),
      );
      const visualSceneIds = new Set(
        payload.visualPlan.scenes.map((scene) => scene.sceneId),
      );
      for (const [index, assignment] of payload.sceneAssignments.entries()) {
        if (!visualSceneIds.has(assignment.sceneId)) {
          context.addIssue({
            code: 'custom',
            message: `Visual assignment references unknown scene ${assignment.sceneId}`,
            path: ['sceneAssignments', index, 'sceneId'],
          });
        }
        for (const subjectId of assignment.subjectIds) {
          if (!subjectIds.has(subjectId)) {
            context.addIssue({
              code: 'custom',
              message: `Visual assignment references unknown subject ${subjectId}`,
              path: ['sceneAssignments', index, 'subjectIds'],
            });
          }
        }
      }
    }
  });

export type EpisodeVisualPayload = z.infer<typeof episodeVisualPayloadSchema>;

export function parseEpisodeVisualPayload(
  input: unknown,
): EpisodeVisualPayload {
  return episodeVisualPayloadSchema.parse(input);
}

export function sceneSentencesForDraft(
  script: string,
  draft: StoryboardDraft,
): { sceneId: string; text: string }[] {
  const sentences = splitCanonicalSentences(script);
  return draft.scenes.flatMap((scene) => {
    const text = canonicalSentenceRangeText(
      script,
      sentences,
      scene.startSentenceId,
      scene.endSentenceId,
    )?.trim();
    return text
      ? [{ sceneId: scene.sceneId, text: text.slice(0, 400) }]
      : [];
  });
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
  subjectCatalog?: VisualSubjectCatalog | null;
  sceneAssignments?: readonly VisualSceneSubjectAssignment[];
}): string {
  const hashInput = {
    visualVersion: input.visualVersion,
    episodeId: input.episodeId,
    canonicalLocalizationId: input.canonicalLocalizationId,
    scenes: input.scenes,
    selectedScenes: input.selectedScenes,
    subjectCatalog: input.subjectCatalog ?? null,
    sceneAssignments: input.sceneAssignments ?? [],
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
  searchIntentModel: string | null;
  selectedScenes: readonly PlannedVisualScene[];
  assets: readonly PlannedVisualImage[];
  r2ImageUrls: Readonly<Record<string, string>>;
  subjectCatalog?: VisualSubjectCatalog | null;
  sceneAssignments?: readonly VisualSceneSubjectAssignment[];
  searchTitleSource?: 'publisher' | 'english-localization' | 'none';
  articleImageCandidateCount?: number;
  searchTrace?: readonly VisualSearchTraceEntry[];
  sceneSentences?: readonly { sceneId: string; text: string }[];
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
    sceneAssets: input.storyboard.draft.scenes.map((scene) => {
      const assetId = sceneAssetById.get(scene.sceneId);
      const asset = assetId ? assetById.get(assetId) : undefined;
      const r2Url = assetId ? input.r2ImageUrls[assetId] : undefined;
      if (!assetId || !asset || !r2Url) {
        throw new Error(`Visual image is missing for ${scene.sceneId}`);
      }
      const sourceId = `${assetId}-source`;
      const presentation = presentationForAsset(asset);
      return {
        sceneId: scene.sceneId,
        sources: [
          {
            id: sourceId,
            label:
              asset.provider === 'brand' || asset.provider === 'generated-slide'
                ? 'Zap Pilot'
                : sourceLabel(asset.sourcePageUrl),
            url: asset.sourcePageUrl,
            attribution: assetAttribution(asset),
            license: asset.license,
            licenseUrl: STOCK_LICENSE_URLS[asset.license] ?? null,
          },
        ],
        asset: {
          kind: 'remoteImage' as const,
          sourceId,
          url: r2Url,
          sha256: asset.sha256,
          layout: presentation.layout,
          position: 'center' as const,
          motion: presentation.motion,
        },
      };
    }),
  });

  const subjectContext =
    input.subjectCatalog && input.sceneAssignments
      ? {
          subjectCatalog: input.subjectCatalog,
          sceneAssignments: [...input.sceneAssignments],
        }
      : {};
  const articleImageAssetCount = input.assets.filter(
    (asset) => asset.provider === 'article',
  ).length;

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
        ...(asset.photographer ? { photographer: asset.photographer } : {}),
        ...(asset.photographerUrl
          ? { photographerUrl: asset.photographerUrl }
          : {}),
        contentType: asset.contentType,
        sha256: asset.sha256,
        perceptualHash: asset.perceptualHash,
        width: asset.width,
        height: asset.height,
        ...(asset.slide ? { slide: asset.slide } : {}),
      };
    }),
    ...subjectContext,
    provenance: {
      storyboardProvider: input.storyboard.effectiveProvider,
      storyboardModel: input.storyboard.model,
      storyboardPromptVersion: EPISODE_VISUAL_STORYBOARD_PROMPT_VERSION,
      usedFallback: input.storyboard.usedFallback,
      searchIntentModel: input.searchIntentModel,
      ...(input.searchTitleSource
        ? { searchTitleSource: input.searchTitleSource }
        : {}),
      ...(input.articleImageCandidateCount !== undefined
        ? { articleImageCandidateCount: input.articleImageCandidateCount }
        : {}),
      articleImageAssetCount,
      ...(input.searchTrace ? { searchTrace: [...input.searchTrace] } : {}),
      ...(input.sceneSentences
        ? { sceneSentences: [...input.sceneSentences] }
        : {}),
      generatedSlideCount: input.assets.filter(
        (asset) => asset.provider === 'generated-slide',
      ).length,
      generatedSlideSceneIds: input.selectedScenes
        .filter((scene) => {
          const asset = assetById.get(scene.assetId);
          return asset?.provider === 'generated-slide';
        })
        .map((scene) => scene.sceneId),
    },
  });
}

function presentationForAsset(asset: PlannedVisualImage): {
  layout: 'fullBleed' | 'contain';
  motion: 'static' | 'pushIn' | 'pan';
} {
  if (asset.provider === 'brand' || asset.provider === 'generated-slide')
    return { layout: 'contain', motion: 'static' };
  const aspectRatio = asset.width / asset.height;
  // The portrait renderer's media window is ~1.125:1. Preserve the complete
  // composition when the source differs materially instead of cropping a 16:9
  // news photo, screenshot, chart or portrait before the viewer can read it.
  if (aspectRatio < 0.9 || aspectRatio > 1.45) {
    return { layout: 'contain', motion: 'static' };
  }
  return { layout: 'fullBleed', motion: 'pushIn' };
}

const STOCK_LICENSE_URLS: Partial<
  Record<PlannedVisualImage['license'], string>
> = {
  pexels: 'https://www.pexels.com/license/',
  pixabay: 'https://pixabay.com/service/license-summary/',
};

const STOCK_PROVIDER_LABELS: Partial<
  Record<PlannedVisualImage['provider'], string>
> = {
  pexels: 'Pexels',
  pixabay: 'Pixabay',
};

function assetAttribution(asset: PlannedVisualImage): string {
  if (asset.provider === 'brand') return 'Zap Pilot';
  if (asset.provider === 'generated-slide') {
    return 'Zap Pilot · generated concept card';
  }
  const providerLabel = STOCK_PROVIDER_LABELS[asset.provider];
  if (providerLabel) {
    return asset.photographer
      ? `Photo by ${asset.photographer} · ${providerLabel}`
      : `Photo · ${providerLabel}`;
  }
  return `Image source · ${sourceLabel(asset.sourcePageUrl)}`;
}

function sourceLabel(sourceUrl: string): string {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return 'image source';
  }
}
