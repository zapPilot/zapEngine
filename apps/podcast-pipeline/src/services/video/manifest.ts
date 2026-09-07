import { z } from 'zod';

import {
  remoteImageAssetSchema,
  type VisualSource,
  visualSourceSchema,
} from './storyboard/visual-plan.js';
import { lineUnits } from './text-units.js';

// The version every manifest is generated and parsed as; nothing else exists.
export const VERTICAL_VIDEO_SCHEMA_VERSION = 'podcast-slide-video.v4' as const;
export const PORTRAIT_OUTPUT_WIDTH = 720 as const;
export const PORTRAIT_OUTPUT_HEIGHT = 1280 as const;
export const OUTPUT_FPS = 24 as const;
// BGM keeps playing for this long after narration ends so the outro card can
// breathe.
export const OUTRO_TAIL_MS = 2_800 as const;
export const MEDIA_WINDOW = {
  x: 0,
  y: 413,
  width: 720,
  height: 640,
} as const;
export const BGM_TRACK_IDS = ['bgm-01', 'bgm-02', 'bgm-03'] as const;
export const HEADLINE_MAX_UNITS_PER_LINE = 14;
export const HEADLINE_MAX_TITLE_LINES = 3;

const commonSlideShape = {
  id: z.string().regex(/^[a-z\d][a-z\d-]*$/),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  sources: z.array(visualSourceSchema).min(1),
};

const imageSlideSchema = z
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

function clipSchemaFor<
  Width extends number,
  Height extends number,
  Fps extends number,
>(width: Width, height: Height, fps: Fps) {
  return z
    .object({
      startMs: z.literal(0),
      durationMs: z.number().int().positive(),
      width: z.literal(width),
      height: z.literal(height),
      fps: z.literal(fps),
      transitionMs: z.number().int().min(0).max(1_000),
    })
    .strict();
}

const portraitClipSchema = clipSchemaFor(
  PORTRAIT_OUTPUT_WIDTH,
  PORTRAIT_OUTPUT_HEIGHT,
  OUTPUT_FPS,
);

const verticalAudioSchema = z
  .object({
    sourceUrl: z.string().min(1),
    narrationDurationMs: z.number().int().positive(),
  })
  .strict();

function mediaWindowSchemaFor<
  X extends number,
  Y extends number,
  Width extends number,
  Height extends number,
>(window: { x: X; y: Y; width: Width; height: Height }) {
  return z
    .object({
      x: z.literal(window.x),
      y: z.literal(window.y),
      width: z.literal(window.width),
      height: z.literal(window.height),
    })
    .strict();
}

const mediaWindowSchema = mediaWindowSchemaFor(MEDIA_WINDOW);

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

interface ManifestForValidation {
  rendererVersion: string;
  clip: { durationMs: number; fps: number; transitionMs: number };
  slides: {
    id: string;
    startMs: number;
    endMs: number;
    sources: VisualSource[];
    asset: z.infer<typeof remoteImageAssetSchema>;
  }[];
  captions: z.infer<typeof captionSchema>[];
}

function validateManifest(
  manifest: ManifestForValidation,
  context: z.RefinementCtx,
  options: {
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

    const expectedId = `scene-${String(index + 1).padStart(2, '0')}`;
    if (slide.id !== expectedId) {
      context.addIssue({
        code: 'custom',
        message: `Scene ${index + 1} must use stable ID ${expectedId}`,
        path: ['slides', index, 'id'],
      });
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
    const source = slide.sources.find(
      (candidate) => candidate.id === asset.sourceId,
    );
    if (!source) {
      context.addIssue({
        code: 'custom',
        message: `Asset source ${asset.sourceId} is missing from slide sources`,
        path: ['slides', index, 'asset', 'sourceId'],
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
  });

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

function validateVerticalManifest(
  manifest: ManifestForValidation & {
    audio: { narrationDurationMs: number };
    outro: { startMs: number };
  },
  context: z.RefinementCtx,
): void {
  validateManifest(manifest, context, {
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
}

const verticalManifestFields = {
  rendererVersion: z.string().regex(/^satori-resvg-v\d+$/),
  episode: episodeSchema,
  headline: headlineSchema,
  audio: verticalAudioSchema,
  bgm: bgmSchema,
  outro: outroSchema,
  slides: z.array(imageSlideSchema).min(1).max(64),
  captions: z.array(captionSchema).min(1),
} as const;

export const verticalVideoManifestSchema = z
  .object({
    schemaVersion: z.literal(VERTICAL_VIDEO_SCHEMA_VERSION),
    ...verticalManifestFields,
    clip: portraitClipSchema,
    mediaWindow: mediaWindowSchema,
  })
  .strict()
  .superRefine(validateVerticalManifest);

export type VerticalVideoManifest = z.infer<typeof verticalVideoManifestSchema>;
export type Slide = VerticalVideoManifest['slides'][number];
export type SlideSource = VisualSource;

export function parseVerticalVideoManifest(
  input: unknown,
): VerticalVideoManifest {
  return verticalVideoManifestSchema.parse(input);
}
