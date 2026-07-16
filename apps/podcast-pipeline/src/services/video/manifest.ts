import { z } from 'zod';

export const VIDEO_SCHEMA_VERSION = 'podcast-slide-video.v1' as const;
export const OUTPUT_WIDTH = 1920 as const;
export const OUTPUT_HEIGHT = 1080 as const;
export const RASTER_SCALE = 2 as const;
export const OUTPUT_FPS = 30 as const;

const sourceLicenseSchema = z.enum([
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

const sourceSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    url: z.string().url().nullable(),
    attribution: z.string().min(1),
    license: sourceLicenseSchema,
    licenseUrl: z.string().url().nullable(),
  })
  .strict();

const noAssetSchema = z.object({ kind: z.literal('none') }).strict();

const remoteImageAssetSchema = z
  .object({
    kind: z.literal('remoteImage'),
    sourceId: z.string().min(1),
    url: z.string().url(),
    sha256: z.string().regex(/^[a-f\d]{64}$/),
    layout: z.enum(['fullBleed', 'framed']),
    position: z.enum(['center', 'top', 'bottom']).default('center'),
  })
  .strict();

const bundledMapAssetSchema = z
  .object({
    kind: z.literal('bundledMap'),
    sourceId: z.string().min(1),
    key: z.literal('us-states-cc0'),
    layout: z.literal('framed'),
    highlightRegionIds: z.array(z.string().regex(/^[a-z]{2}$/)).min(1),
  })
  .strict();

const slideAssetSchema = z.discriminatedUnion('kind', [
  noAssetSchema,
  remoteImageAssetSchema,
  bundledMapAssetSchema,
]);

const commonSlideShape = {
  id: z.string().regex(/^[a-z\d][a-z\d-]*$/),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  sources: z.array(sourceSchema).min(1),
  asset: slideAssetSchema,
};

const coverSlideSchema = z
  .object({
    ...commonSlideShape,
    template: z.literal('cover'),
    kicker: z.string().min(1).max(80),
    headline: z.string().min(1).max(96),
    subheadline: z.string().min(1).max(128),
  })
  .strict();

const photoFactSlideSchema = z
  .object({
    ...commonSlideShape,
    template: z.literal('photoFact'),
    eyebrow: z.string().min(1).max(80),
    headline: z.string().min(1).max(72),
    subheadline: z.string().max(120).optional(),
    facts: z.array(z.string().min(1).max(64)).min(1).max(3),
  })
  .strict();

const statisticSlideSchema = z
  .object({
    ...commonSlideShape,
    template: z.literal('statistic'),
    eyebrow: z.string().min(1).max(80),
    value: z.string().min(1).max(24),
    unit: z.string().max(24).optional(),
    label: z.string().min(1).max(96),
    secondaryValue: z.string().max(24).optional(),
    secondaryLabel: z.string().max(96).optional(),
    context: z.string().max(120).optional(),
  })
  .strict();

const documentSlideSchema = z
  .object({
    ...commonSlideShape,
    template: z.literal('document'),
    issuer: z.string().min(1).max(80),
    documentNumber: z.string().min(1).max(48),
    date: z.string().min(1).max(40),
    headline: z.string().min(1).max(96),
    excerpt: z.string().min(1).max(180),
  })
  .strict();

const sourceQuoteSlideSchema = z
  .object({
    ...commonSlideShape,
    template: z.literal('sourceQuote'),
    eyebrow: z.string().min(1).max(80),
    quote: z.string().min(1).max(180),
    context: z.string().max(120).optional(),
    citation: z.string().min(1).max(96),
  })
  .strict();

const slideSchema = z.discriminatedUnion('template', [
  coverSlideSchema,
  photoFactSlideSchema,
  statisticSlideSchema,
  documentSlideSchema,
  sourceQuoteSlideSchema,
]);

const captionSchema = z
  .object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    text: z.string().min(1).max(120),
  })
  .strict();

const openFullBleedLicenses = new Set<z.infer<typeof sourceLicenseSchema>>([
  'public-domain',
  'cc0',
  'cc-by-2.0',
  'cc-by-4.0',
  'cc-by-sa-4.0',
  'official-public-domain',
]);

export const slideVideoManifestSchema = z
  .object({
    schemaVersion: z.literal(VIDEO_SCHEMA_VERSION),
    rendererVersion: z.string().regex(/^satori-resvg-v\d+$/),
    episode: z
      .object({
        id: z.string().uuid(),
        localizationId: z.string().uuid(),
        languageCode: z.string().min(2).max(16),
        title: z.string().min(1).max(180),
      })
      .strict(),
    clip: z
      .object({
        startMs: z.literal(0),
        durationMs: z.number().int().positive(),
        width: z.literal(OUTPUT_WIDTH),
        height: z.literal(OUTPUT_HEIGHT),
        fps: z.literal(OUTPUT_FPS),
        transitionMs: z.number().int().min(0).max(1_000),
      })
      .strict(),
    audio: z
      .object({
        sourceUrl: z.string().min(1),
      })
      .strict(),
    slides: z.array(slideSchema).min(1),
    captions: z.array(captionSchema),
  })
  .strict()
  .superRefine((manifest, context) => {
    const strictGeneratedTiming =
      manifest.rendererVersion !== 'satori-resvg-v1';
    const frameDurationMs = 1_000 / manifest.clip.fps;
    const transitionFrames = Math.round(
      (manifest.clip.transitionMs * manifest.clip.fps) / 1_000,
    );

    manifest.slides.forEach((slide, index) => {
      const previousSlide = manifest.slides[index - 1];
      const expectedStartMs = previousSlide?.endMs ?? 0;

      if (slide.startMs !== expectedStartMs) {
        context.addIssue({
          code: 'custom',
          message: `Slide ${slide.id} must start at ${expectedStartMs}ms`,
          path: ['slides', index, 'startMs'],
        });
      }

      if (slide.endMs <= slide.startMs) {
        context.addIssue({
          code: 'custom',
          message: `Slide ${slide.id} must end after it starts`,
          path: ['slides', index, 'endMs'],
        });
      }

      const durationFrames = Math.round(
        ((slide.endMs - slide.startMs) * manifest.clip.fps) / 1_000,
      );
      if (durationFrames <= transitionFrames) {
        context.addIssue({
          code: 'custom',
          message: `Slide ${slide.id} must be longer than the transition`,
          path: ['slides', index],
        });
      }

      const roundedStartMs =
        (Math.round(slide.startMs / frameDurationMs) * 1_000) /
        manifest.clip.fps;
      if (Math.abs(roundedStartMs - slide.startMs) > 0.51) {
        context.addIssue({
          code: 'custom',
          message: `Slide ${slide.id} start must align with a video frame`,
          path: ['slides', index, 'startMs'],
        });
      }

      if (slide.asset.kind === 'none') return;

      const sourceId = slide.asset.sourceId;
      const source = slide.sources.find(
        (candidate) => candidate.id === sourceId,
      );
      if (!source) {
        context.addIssue({
          code: 'custom',
          message: `Asset source ${sourceId} is missing from slide sources`,
          path: ['slides', index, 'asset', 'sourceId'],
        });
        return;
      }

      if (
        slide.asset.kind === 'remoteImage' &&
        slide.asset.layout === 'fullBleed' &&
        !openFullBleedLicenses.has(source.license)
      ) {
        context.addIssue({
          code: 'custom',
          message: `Full-bleed image ${slide.asset.sourceId} requires an open license`,
          path: ['slides', index, 'asset', 'layout'],
        });
      }
    });

    const lastSlide = manifest.slides.at(-1);
    if (lastSlide?.endMs !== manifest.clip.durationMs) {
      context.addIssue({
        code: 'custom',
        message: 'The final slide must end at the clip duration',
        path: ['slides', manifest.slides.length - 1, 'endMs'],
      });
    }

    if (strictGeneratedTiming) {
      const captionBoundaries = new Set<number>();
      for (const caption of manifest.captions) {
        captionBoundaries.add(caption.startMs);
        captionBoundaries.add(caption.endMs);
      }
      manifest.slides.forEach((slide, index) => {
        if (!captionBoundaries.has(slide.startMs)) {
          context.addIssue({
            code: 'custom',
            message: `Slide ${slide.id} start must match a caption boundary`,
            path: ['slides', index, 'startMs'],
          });
        }
        if (!captionBoundaries.has(slide.endMs)) {
          context.addIssue({
            code: 'custom',
            message: `Slide ${slide.id} end must match a caption boundary`,
            path: ['slides', index, 'endMs'],
          });
        }
      });
    }

    manifest.captions.forEach((caption, index) => {
      if (caption.endMs <= caption.startMs) {
        context.addIssue({
          code: 'custom',
          message: 'Caption must end after it starts',
          path: ['captions', index, 'endMs'],
        });
      }
      if (caption.endMs > manifest.clip.durationMs) {
        context.addIssue({
          code: 'custom',
          message: 'Caption extends beyond the clip',
          path: ['captions', index, 'endMs'],
        });
      }
      if (caption.text.split('\n').length > 2) {
        context.addIssue({
          code: 'custom',
          message: 'Caption may contain at most two lines',
          path: ['captions', index, 'text'],
        });
      }
      if (strictGeneratedTiming) {
        const previous = manifest.captions[index - 1];
        if (previous && caption.startMs < previous.endMs) {
          context.addIssue({
            code: 'custom',
            message: 'Captions must be ordered and non-overlapping',
            path: ['captions', index, 'startMs'],
          });
        }
        for (const [field, value] of [
          ['startMs', caption.startMs],
          ['endMs', caption.endMs],
        ] as const) {
          const rounded =
            (Math.round(value / frameDurationMs) * 1_000) / manifest.clip.fps;
          if (Math.abs(rounded - value) > 0.51) {
            context.addIssue({
              code: 'custom',
              message: `Caption ${field} must align with a video frame`,
              path: ['captions', index, field],
            });
          }
        }
      }
    });

    if (strictGeneratedTiming) {
      if (manifest.captions[0]?.startMs !== 0) {
        context.addIssue({
          code: 'custom',
          message: 'Generated captions must start at 0ms',
          path: ['captions', 0, 'startMs'],
        });
      }
      if (manifest.captions.at(-1)?.endMs !== manifest.clip.durationMs) {
        context.addIssue({
          code: 'custom',
          message: 'Generated captions must end at the clip duration',
          path: ['captions', manifest.captions.length - 1, 'endMs'],
        });
      }
    }
  });

export type SlideVideoManifest = z.infer<typeof slideVideoManifestSchema>;
export type Slide = SlideVideoManifest['slides'][number];
export type SlideSource = Slide['sources'][number];
export type SlideAsset = Slide['asset'];

export function parseSlideVideoManifest(input: unknown): SlideVideoManifest {
  return slideVideoManifestSchema.parse(input);
}
