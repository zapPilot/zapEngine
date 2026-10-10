import { z } from 'zod';

import { LOOP_IDS } from './specs';

export const loopSchema = z
  .object({
    id: z.enum(LOOP_IDS),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    sampleRate: z.literal(48000),
    fps: z.literal(30),
    periodSamples: z.number().int().positive(),
    crossfadeSamples: z.number().int().positive(),
    rho: z.number().min(0).max(1),
    source: z.object({
      file: z.string(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      model: z.string(),
      prompt: z.string(),
      commit: z.string(),
    }),
    cut: z.object({
      startSeconds: z.number().nonnegative(),
      periodSeconds: z.number().positive(),
      bpm: z.number().positive(),
      bars: z.number().int().positive(),
    }),
    rate: z.number().min(0.998).max(1.002),
    cents: z.number(),
    gainDb: z.number(),
    seam: z.object({
      levelDifferenceDb: z.number(),
      spectralSimilarity: z.number(),
      chromaSimilarity: z.number(),
      score: z.number(),
    }),
    report: z.object({
      durationSeconds: z.number().positive(),
      leadingSilenceSeconds: z.number(),
      loudness: z.object({
        i: z.number(),
        tp: z.number(),
        lra: z.number(),
        thresh: z.number(),
        offset: z.number(),
      }),
    }),
    review: z.object({
      status: z.enum(['pending', 'accepted']),
      acceptedAt: z.string().optional(),
      sha256: z.string().optional(),
    }),
  })
  .superRefine((value, ctx) => {
    if (
      value.periodSamples % 1600 ||
      value.crossfadeSamples % 1600 ||
      value.crossfadeSamples >= value.periodSamples
    )
      ctx.addIssue({ code: 'custom', message: 'Loop must align to frames' });
    if (
      value.review.status === 'accepted' &&
      (!value.review.acceptedAt || value.review.sha256 !== value.sha256)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Acceptance must identify the reviewed clip',
      });
  });
export type MusicLoop = z.infer<typeof loopSchema>;
