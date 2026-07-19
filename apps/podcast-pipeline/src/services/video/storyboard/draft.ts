import { z } from 'zod';

const sentenceIdSchema = z.string().regex(/^s\d{4}$/);
const sentenceRangeShape = {
  startSentenceId: sentenceIdSchema,
  endSentenceId: sentenceIdSchema,
};

const imageSearchIntentSchema = z
  .array(z.string().min(2).max(80))
  .max(3)
  .default([]);

// jscpd:ignore-start — parallel Zod schemas to manifest.ts for different pipeline stages
const coverDraftSchema = z
  .object({
    ...sentenceRangeShape,
    template: z.literal('cover'),
    kicker: z.string().min(1).max(80),
    headline: z.string().min(1).max(96),
    subheadline: z.string().min(1).max(128),
    imageSearchIntent: imageSearchIntentSchema,
  })
  .strict();

const evidencedShape = {
  ...sentenceRangeShape,
  evidenceText: z.string().min(1).max(800),
  imageSearchIntent: imageSearchIntentSchema,
};

const photoFactDraftSchema = z
  .object({
    ...evidencedShape,
    template: z.literal('photoFact'),
    eyebrow: z.string().min(1).max(80),
    headline: z.string().min(1).max(72),
    subheadline: z.string().max(120).optional(),
    facts: z.array(z.string().min(1).max(64)).min(1).max(3),
  })
  .strict();

const statisticDraftSchema = z
  .object({
    ...evidencedShape,
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

const documentDraftSchema = z
  .object({
    ...evidencedShape,
    template: z.literal('document'),
    issuer: z.string().min(1).max(80),
    documentNumber: z.string().min(1).max(48),
    date: z.string().min(1).max(40),
    headline: z.string().min(1).max(96),
    excerpt: z.string().min(1).max(180),
  })
  .strict();

const sourceQuoteDraftSchema = z
  .object({
    ...evidencedShape,
    template: z.literal('sourceQuote'),
    eyebrow: z.string().min(1).max(80),
    quote: z.string().min(1).max(180),
    context: z.string().max(120).optional(),
    citation: z.string().min(1).max(96),
  })
  .strict();
// jscpd:ignore-end

export const storyboardDraftSlideSchema = z.discriminatedUnion('template', [
  coverDraftSchema,
  photoFactDraftSchema,
  statisticDraftSchema,
  documentDraftSchema,
  sourceQuoteDraftSchema,
]);

export const storyboardDraftSchema = z
  .object({
    slides: z.array(storyboardDraftSlideSchema).min(1).max(64),
  })
  .strict();

export type StoryboardDraft = z.infer<typeof storyboardDraftSchema>;
export type StoryboardDraftSlide = StoryboardDraft['slides'][number];
export type EvidencedStoryboardDraftSlide = Exclude<
  StoryboardDraftSlide,
  { template: 'cover' }
>;
