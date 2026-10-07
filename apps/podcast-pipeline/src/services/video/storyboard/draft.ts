import { z } from 'zod';

export const MAX_STORYBOARD_SLIDES = 150;

export const SCENE_ID_PATTERN = /^scene-\d{2,3}$/;

// Only catalog enrichment produces content-scene search intents.
export const MIN_SEARCH_INTENT_CHARACTERS = 2;
export const MAX_SEARCH_INTENT_CHARACTERS = 113;
export const MAX_SEARCH_INTENTS_PER_SCENE = 3;
export const MAX_SEARCH_ENTITIES_PER_SCENE = 4;
export const MAX_VISUAL_CUE_WORDS = 5;
export const MAX_VISUAL_CUE_CHARACTERS = 48;

const sentenceIdSchema = z.string().regex(/^s\d{4}$/);

export const storyboardDraftSceneSchema = z
  .object({
    sceneId: z.string().regex(SCENE_ID_PATTERN),
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
      .max(MAX_SEARCH_INTENTS_PER_SCENE)
      .optional(),
    // A compact, grounded description of the photographable moment in this
    // scene. Older checkpoints do not have it, so it must remain optional.
    visualCue: z
      .string()
      .min(MIN_SEARCH_INTENT_CHARACTERS)
      .max(MAX_VISUAL_CUE_CHARACTERS)
      .optional(),
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

export const enrichedStoryboardDraftSchema = z
  .object({
    scenes: z
      .array(
        storyboardDraftSceneSchema.extend({
          imageSearchIntent:
            storyboardDraftSceneSchema.shape.imageSearchIntent.unwrap(),
        }),
      )
      .min(1)
      .max(MAX_STORYBOARD_SLIDES),
  })
  .strict();
export type EnrichedStoryboardDraft = z.infer<
  typeof enrichedStoryboardDraftSchema
>;
