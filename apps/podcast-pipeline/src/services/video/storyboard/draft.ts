import { z } from 'zod';

export const MAX_STORYBOARD_SLIDES = 64;

// Every producer of search intents — the deterministic table and the LLM
// enrichment pass — has to fit the same shape this schema accepts.
export const MIN_SEARCH_INTENT_CHARACTERS = 2;
export const MAX_SEARCH_INTENT_CHARACTERS = 80;
export const MAX_SEARCH_INTENTS_PER_SCENE = 3;
export const MAX_SEARCH_ENTITIES_PER_SCENE = 4;

const sentenceIdSchema = z.string().regex(/^s\d{4}$/);

export const storyboardDraftSceneSchema = z
  .object({
    sceneId: z.string().regex(/^scene-\d{2}$/),
    startSentenceId: sentenceIdSchema,
    endSentenceId: sentenceIdSchema,
    imageSearchIntent: z
      .array(
        z
          .string()
          .min(MIN_SEARCH_INTENT_CHARACTERS)
          .max(MAX_SEARCH_INTENT_CHARACTERS),
      )
      .min(1)
      .max(MAX_SEARCH_INTENTS_PER_SCENE),
    // The proper nouns this scene actually names, verbatim, when it names any.
    // Image search anchors on them: a candidate that mentions none of a scene's
    // entities is not about that scene, however well its wording overlaps.
    // Absent means the scene names nothing — a legitimate, generic scene.
    imageSearchEntities: z
      .array(
        z
          .string()
          .min(MIN_SEARCH_INTENT_CHARACTERS)
          .max(MAX_SEARCH_INTENT_CHARACTERS),
      )
      .min(1)
      .max(MAX_SEARCH_ENTITIES_PER_SCENE)
      .optional(),
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
