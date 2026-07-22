import { z } from 'zod';

export const MAX_STORYBOARD_SLIDES = 64;

const sentenceIdSchema = z.string().regex(/^s\d{4}$/);

export const storyboardDraftSceneSchema = z
  .object({
    sceneId: z.string().regex(/^scene-\d{2}$/),
    startSentenceId: sentenceIdSchema,
    endSentenceId: sentenceIdSchema,
    imageSearchIntent: z.array(z.string().min(2).max(80)).min(1).max(3),
  })
  .strict();

export const storyboardDraftSchema = z
  .object({
    scenes: z
      .array(storyboardDraftSceneSchema)
      .min(1)
      .max(MAX_STORYBOARD_SLIDES),
  })
  .strict();

export type StoryboardDraft = z.infer<typeof storyboardDraftSchema>;
export type StoryboardDraftScene = StoryboardDraft['scenes'][number];
