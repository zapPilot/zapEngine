import { z } from 'zod';

import {
  remoteImageAssetSchema,
  sourceLicenseSchema,
  type VisualSource,
  visualSourceSchema,
} from './storyboard/visual-plan.js';
import { lineUnits } from './text-units.js';

export const LEGACY_VIDEO_SCHEMA_VERSION = 'podcast-slide-video.v1' as const;
export const IMAGE_VIDEO_SCHEMA_VERSION = 'podcast-slide-video.v2' as const;
// The version producers stamp on freshly generated manifests; parsers keep
// accepting every version above so stored renders stay readable.
export const VERTICAL_VIDEO_SCHEMA_VERSION = 'podcast-slide-video.v3' as const;
// Landscape dimensions are frozen for stored v1/v2 manifests; portrait is the
// 9:16 news layout every new render uses.
export const LANDSCAPE_OUTPUT_WIDTH = 1920 as const;
export const LANDSCAPE_OUTPUT_HEIGHT = 1080 as const;
export const PORTRAIT_OUTPUT_WIDTH = 1080 as const;
export const PORTRAIT_OUTPUT_HEIGHT = 1920 as const;
export const RASTER_SCALE = 2 as const;
export const OUTPUT_FPS = 30 as const;
// BGM keeps playing for this long after narration ends so the outro card can
// breathe; 2800ms is exactly 84 frames at 30fps, keeping the clip frame-aligned.
export const OUTRO_TAIL_MS = 2_800 as const;
export const MEDIA_WINDOW = {
  x: 0,
  y: 620,
  width: 1080,
  height: 960,
} as const;
export const BGM_TRACK_IDS = ['bgm-01', 'bgm-02', 'bgm-03'] as const;
export const HEADLINE_MAX_UNITS_PER_LINE = 14;
export const HEADLINE_MAX_TITLE_LINES = 3;

const noAssetSchema = z.object({ kind: z.literal('none') }).strict();

const legacyRemoteImageAssetSchema = remoteImageAssetSchema.extend({
  layout: z.enum(['fullBleed', 'framed']),
});

const bundledMapAssetSchema = z
  .object({
    kind: z.literal('bundledMap'),
    sourceId: z.string().min(1),
    key: z.literal('us-states-cc0'),
    layout: z.literal('framed'),
    highlightRegionIds: z.array(z.string().regex(/^[a-z]{2}$/)).min(1),
  })
  .strict();

const legacySlideAssetSchema = z.discriminatedUnion('kind', [
  noAssetSchema,
  legacyRemoteImageAssetSchema,
  bundledMapAssetSchema,
]);

const commonSlideShape = {
  id: z.string().regex(/^[a-z\d][a-z\d-]*$/),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  sources: z.array(visualSourceSchema).min(1),
};

const legacyCommonSlideShape = {
  ...commonSlideShape,
  asset: legacySlideAssetSchema,
};

// jscpd:ignore-start — legacy v1 parsing remains intentionally parallel to
// the retired narrative storyboard contract for stored render compatibility.
const coverSlideSchema = z
  .object({
    ...legacyCommonSlideShape,
    template: z.literal('cover'),
    kicker: z.string().min(1).max(80),
    headline: z.string().min(1).max(96),
    subheadline: z.string().min(1).max(128),
  })
  .strict();

const photoFactSlideSchema = z
  .object({
    ...legacyCommonSlideShape,
    template: z.literal('photoFact'),
    eyebrow: z.string().min(1).max(80),
    headline: z.string().min(1).max(72),
    subheadline: z.string().max(120).optional(),
    facts: z.array(z.string().min(1).max(64)).min(1).max(3),
  })
  .strict();

const statisticSlideSchema = z
  .object({
    ...legacyCommonSlideShape,
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
    ...legacyCommonSlideShape,
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
    ...legacyCommonSlideShape,
    template: z.literal('sourceQuote'),
    eyebrow: z.string().min(1).max(80),
    quote: z.string().min(1).max(180),
    context: z.string().max(120).optional(),
    citation: z.string().min(1).max(96),
  })
  .strict();
// jscpd:ignore-end

const legacySlideSchema = z.discriminatedUnion('template', [
  coverSlideSchema,
  photoFactSlideSchema,
  statisticSlideSchema,
  documentSlideSchema,
  sourceQuoteSlideSchema,
]);

export const imageSlideSchema = z
  .object({
    ...commonSlideShape,
    template: z.literal('image'),
    asset: remoteImageAssetSchema,
  })
  .strict();

const captionSchema = z
  .object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive(),
    text: z.string().min(1).max(120),
  })
  .strict();

const episodeSchema = z
  .object({
    id: z.string().uuid(),
    localizationId: z.string().uuid(),
    languageCode: z.string().min(2).max(16),
    title: z.string().min(1).max(180),
  })
  .strict();

function clipSchemaFor<Width extends number, Height extends number>(
  width: Width,
  height: Height,
) {
  return z
    .object({
      startMs: z.literal(0),
      durationMs: z.number().int().positive(),
      width: z.literal(width),
      height: z.literal(height),
      fps: z.literal(OUTPUT_FPS),
      transitionMs: z.number().int().min(0).max(1_000),
    })
    .strict();
}

const clipSchema = clipSchemaFor(
  LANDSCAPE_OUTPUT_WIDTH,
  LANDSCAPE_OUTPUT_HEIGHT,
);
const portraitClipSchema = clipSchemaFor(
  PORTRAIT_OUTPUT_WIDTH,
  PORTRAIT_OUTPUT_HEIGHT,
);

const audioSchema = z
  .object({
    sourceUrl: z.string().min(1),
  })
  .strict();

const verticalAudioSchema = z
  .object({
    sourceUrl: z.string().min(1),
    narrationDurationMs: z.number().int().positive(),
  })
  .strict();

const mediaWindowSchema = z
  .object({
    x: z.literal(MEDIA_WINDOW.x),
    y: z.literal(MEDIA_WINDOW.y),
    width: z.literal(MEDIA_WINDOW.width),
    height: z.literal(MEDIA_WINDOW.height),
  })
  .strict();

const headlineSchema = z
  .object({
    kicker: z.string().min(1).max(24),
    titleLines: z
      .array(z.string().min(1).max(28))
      .min(1)
      .max(HEADLINE_MAX_TITLE_LINES),
  })
  .strict()
  .superRefine((headline, context) => {
    if (lineUnits(headline.kicker) > HEADLINE_MAX_UNITS_PER_LINE) {
      context.addIssue({
        code: 'custom',
        message: `Headline kicker exceeds ${HEADLINE_MAX_UNITS_PER_LINE} display units`,
        path: ['kicker'],
      });
    }
    headline.titleLines.forEach((line, index) => {
      if (lineUnits(line) > HEADLINE_MAX_UNITS_PER_LINE) {
        context.addIssue({
          code: 'custom',
          message: `Headline title line ${index + 1} exceeds ${HEADLINE_MAX_UNITS_PER_LINE} display units`,
          path: ['titleLines', index],
        });
      }
    });
  });

const bgmSchema = z
  .object({
    trackId: z.enum(BGM_TRACK_IDS),
    gainDb: z.number().min(-40).max(0),
  })
  .strict();

const outroSchema = z
  .object({
    startMs: z.number().int().positive(),
    title: z.string().min(1).max(48),
    callToAction: z.string().min(1).max(64),
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

interface ManifestForValidation {
  rendererVersion: string;
  clip: { durationMs: number; fps: number; transitionMs: number };
  slides: {
    id: string;
    startMs: number;
    endMs: number;
    sources: VisualSource[];
    asset:
      | z.infer<typeof legacySlideAssetSchema>
      | z.infer<typeof remoteImageAssetSchema>;
  }[];
  captions: z.infer<typeof captionSchema>[];
}

function validateManifest(
  manifest: ManifestForValidation,
  context: z.RefinementCtx,
  options: {
    strictGeneratedTiming: boolean;
    imageOnly: boolean;
    // Portrait manifests keep a BGM-only outro tail after narration, so the
    // slide/caption timeline ends before the clip does.
    contentEndMs?: number;
  },
): void {
  const contentEndMs = options.contentEndMs ?? manifest.clip.durationMs;
  const contentEndLabel =
    options.contentEndMs === undefined
      ? 'the clip duration'
      : 'the narration end';
  const captionBoundLabel =
    options.contentEndMs === undefined ? 'the clip' : 'the narration';
  const frameDurationMs = 1_000 / manifest.clip.fps;
  const transitionFrames = Math.round(
    (manifest.clip.transitionMs * manifest.clip.fps) / 1_000,
  );

  if (
    options.imageOnly &&
    contentEndMs >= 85_000 &&
    contentEndMs <= 95_000 &&
    (manifest.slides.length < 8 || manifest.slides.length > 10)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'A 90-second image video must contain 8-10 scenes',
      path: ['slides'],
    });
  }

  manifest.slides.forEach((slide, index) => {
    const previousSlide = manifest.slides[index - 1];
    const expectedStartMs = previousSlide?.endMs ?? 0;

    if (options.imageOnly) {
      const expectedId = `scene-${String(index + 1).padStart(2, '0')}`;
      if (slide.id !== expectedId) {
        context.addIssue({
          code: 'custom',
          message: `Scene ${index + 1} must use stable ID ${expectedId}`,
          path: ['slides', index, 'id'],
        });
      }
    }

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
      (Math.round(slide.startMs / frameDurationMs) * 1_000) / manifest.clip.fps;
    if (Math.abs(roundedStartMs - slide.startMs) > 0.51) {
      context.addIssue({
        code: 'custom',
        message: `Slide ${slide.id} start must align with a video frame`,
        path: ['slides', index, 'startMs'],
      });
    }

    const asset = slide.asset;
    if (asset.kind === 'none') return;

    const source = slide.sources.find(
      (candidate) => candidate.id === asset.sourceId,
    );
    if (!source) {
      context.addIssue({
        code: 'custom',
        message: `Asset source ${asset.sourceId} is missing from slide sources`,
        path: ['slides', index, 'asset', 'sourceId'],
      });
      return;
    }

    if (
      !options.imageOnly &&
      asset.kind === 'remoteImage' &&
      asset.layout === 'fullBleed' &&
      !openFullBleedLicenses.has(source.license)
    ) {
      context.addIssue({
        code: 'custom',
        message: `Full-bleed image ${asset.sourceId} requires an open license`,
        path: ['slides', index, 'asset', 'layout'],
      });
    }
  });

  const lastSlide = manifest.slides.at(-1);
  if (lastSlide?.endMs !== contentEndMs) {
    context.addIssue({
      code: 'custom',
      message: `The final slide must end at ${contentEndLabel}`,
      path: ['slides', manifest.slides.length - 1, 'endMs'],
    });
  }

  if (options.strictGeneratedTiming) {
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
    if (caption.endMs > contentEndMs) {
      context.addIssue({
        code: 'custom',
        message: `Caption extends beyond ${captionBoundLabel}`,
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
    if (options.strictGeneratedTiming) {
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

  if (!options.strictGeneratedTiming) return;
  if (manifest.captions[0]?.startMs !== 0) {
    context.addIssue({
      code: 'custom',
      message: 'Generated captions must start at 0ms',
      path: ['captions', 0, 'startMs'],
    });
  }
  if (manifest.captions.at(-1)?.endMs !== contentEndMs) {
    context.addIssue({
      code: 'custom',
      message: `Generated captions must end at ${contentEndLabel}`,
      path: ['captions', manifest.captions.length - 1, 'endMs'],
    });
  }
}

export const legacySlideVideoManifestSchema = z
  .object({
    schemaVersion: z.literal(LEGACY_VIDEO_SCHEMA_VERSION),
    rendererVersion: z.string().regex(/^satori-resvg-v\d+$/),
    episode: episodeSchema,
    clip: clipSchema,
    audio: audioSchema,
    slides: z.array(legacySlideSchema).min(1),
    captions: z.array(captionSchema),
  })
  .strict()
  .superRefine((manifest, context) =>
    validateManifest(manifest, context, {
      strictGeneratedTiming: manifest.rendererVersion !== 'satori-resvg-v1',
      imageOnly: false,
    }),
  );

export const imageVideoManifestSchema = z
  .object({
    schemaVersion: z.literal(IMAGE_VIDEO_SCHEMA_VERSION),
    rendererVersion: z.string().regex(/^satori-resvg-v\d+$/),
    episode: episodeSchema,
    clip: clipSchema,
    audio: audioSchema,
    slides: z.array(imageSlideSchema).min(1).max(64),
    captions: z.array(captionSchema).min(1),
  })
  .strict()
  .superRefine((manifest, context) =>
    validateManifest(manifest, context, {
      strictGeneratedTiming: true,
      imageOnly: true,
    }),
  );

/* jscpd:ignore-start — the v3 schema head intentionally parallels the v2 one;
   both are strict zod contracts whose field sets must stay independently
   readable rather than be merged behind a shared factory */
export const verticalVideoManifestSchema = z
  .object({
    schemaVersion: z.literal(VERTICAL_VIDEO_SCHEMA_VERSION),
    rendererVersion: z.string().regex(/^satori-resvg-v\d+$/),
    episode: episodeSchema,
    clip: portraitClipSchema,
    mediaWindow: mediaWindowSchema,
    headline: headlineSchema,
    audio: verticalAudioSchema,
    bgm: bgmSchema,
    outro: outroSchema,
    slides: z.array(imageSlideSchema).min(1).max(64),
    captions: z.array(captionSchema).min(1),
  })
  .strict()
  /* jscpd:ignore-end */
  .superRefine((manifest, context) => {
    validateManifest(manifest, context, {
      strictGeneratedTiming: true,
      imageOnly: true,
      contentEndMs: manifest.audio.narrationDurationMs,
    });
    if (
      manifest.clip.durationMs !==
      manifest.audio.narrationDurationMs + OUTRO_TAIL_MS
    ) {
      context.addIssue({
        code: 'custom',
        message: `Clip duration must equal narration plus the ${OUTRO_TAIL_MS}ms outro tail`,
        path: ['clip', 'durationMs'],
      });
    }
    if (manifest.outro.startMs !== manifest.audio.narrationDurationMs) {
      context.addIssue({
        code: 'custom',
        message: 'Outro must start when narration ends',
        path: ['outro', 'startMs'],
      });
    }
  });

export const slideVideoManifestSchema = z.union([
  verticalVideoManifestSchema,
  imageVideoManifestSchema,
  legacySlideVideoManifestSchema,
]);

export type ImageVideoManifest = z.infer<typeof imageVideoManifestSchema>;
export type VerticalVideoManifest = z.infer<typeof verticalVideoManifestSchema>;
export type LegacySlideVideoManifest = z.infer<
  typeof legacySlideVideoManifestSchema
>;
export type SlideVideoManifest =
  | VerticalVideoManifest
  | ImageVideoManifest
  | LegacySlideVideoManifest;
export type Slide = SlideVideoManifest['slides'][number];
export type ImageSlide = ImageVideoManifest['slides'][number];
export type SlideSource = VisualSource;
export type SlideAsset = Slide['asset'];

export function parseImageVideoManifest(input: unknown): ImageVideoManifest {
  return imageVideoManifestSchema.parse(input);
}

export function parseVerticalVideoManifest(
  input: unknown,
): VerticalVideoManifest {
  return verticalVideoManifestSchema.parse(input);
}

export function parseSlideVideoManifest(input: unknown): SlideVideoManifest {
  return slideVideoManifestSchema.parse(input);
}
