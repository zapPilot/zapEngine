import { z } from 'zod';

export const MAX_STORYBOARD_SLIDES = 64;

const sentenceIdSchema = z.string().regex(/^s\d{4}$/);
const sceneIdSchema = z.string().regex(/^scene-\d{2}$/);
const groundedLabelSchema = z.string().min(1).max(80);

export const diagramLayoutSchema = z.enum([
  'flow',
  'comparison',
  'timeline',
  'layers',
  'systemMap',
  'entityCard',
]);

export const diagramNodeSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z\d-]{0,31}$/),
    label: groundedLabelSchema,
    detail: z.string().min(1).max(96).optional(),
  })
  .strict();

export const diagramEdgeSchema = z
  .object({
    from: z.string().regex(/^[a-z][a-z\d-]{0,31}$/),
    to: z.string().regex(/^[a-z][a-z\d-]{0,31}$/),
    label: z.string().min(1).max(48).optional(),
  })
  .strict();

export const photoVisualSchema = z
  .object({
    kind: z.literal('photo'),
    searchIntents: z.array(z.string().min(2).max(80)).min(1).max(3),
    mustShowEntities: z.array(groundedLabelSchema).min(1).max(4),
  })
  .strict();

export const diagramVisualSchema = z
  .object({
    kind: z.literal('diagram'),
    layout: diagramLayoutSchema,
    nodes: z.array(diagramNodeSchema).min(1).max(6),
    edges: z.array(diagramEdgeSchema).max(8),
  })
  .strict()
  .superRefine((visual, context) => {
    const nodeIds = new Set(visual.nodes.map((node) => node.id));
    if (nodeIds.size !== visual.nodes.length) {
      context.addIssue({
        code: 'custom',
        message: 'Diagram node IDs must be unique',
        path: ['nodes'],
      });
    }
    visual.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.from)) {
        context.addIssue({
          code: 'custom',
          message: `Diagram edge references unknown source node ${edge.from}`,
          path: ['edges', index, 'from'],
        });
      }
      if (!nodeIds.has(edge.to)) {
        context.addIssue({
          code: 'custom',
          message: `Diagram edge references unknown target node ${edge.to}`,
          path: ['edges', index, 'to'],
        });
      }
    });
    if (visual.layout === 'flow' && visual.nodes.length < 2) {
      context.addIssue({
        code: 'custom',
        message: 'Flow diagrams require at least two nodes',
        path: ['nodes'],
      });
    }
  });

export const dataCardVisualSchema = z
  .object({
    kind: z.literal('dataCard'),
    value: z.string().min(1).max(24),
    unit: z.string().min(1).max(24).optional(),
    label: z.string().min(1).max(96),
    secondaryValue: z.string().min(1).max(24).optional(),
    secondaryLabel: z.string().min(1).max(96).optional(),
  })
  .strict()
  .superRefine((visual, context) => {
    if (
      (visual.secondaryValue === undefined) !==
      (visual.secondaryLabel === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Secondary value and label must be provided together',
        path: ['secondaryValue'],
      });
    }
  });

export const storyboardVisualSchema = z.discriminatedUnion('kind', [
  photoVisualSchema,
  diagramVisualSchema,
  dataCardVisualSchema,
]);

export const storyboardDraftSceneSchema = z
  .object({
    sceneId: sceneIdSchema,
    startSentenceId: sentenceIdSchema,
    endSentenceId: sentenceIdSchema,
    visual: storyboardVisualSchema,
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
