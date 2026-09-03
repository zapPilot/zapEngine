import { z } from 'zod';

/**
 * Why an episode ended up with the images it has. Every Brave request and every
 * scene decision is recorded, including the decisions that degraded quality
 * without failing the job: a scene whose own subject was never searched, one
 * that borrowed another subject's photo, one that reused an earlier asset. The
 * planner returns this alongside the plan, and the processor accumulates the
 * same shape from progress events so a failed attempt is explainable too.
 */
const MAX_TRACE_REQUESTS = 16;
const MAX_TRACE_SCENES = 64;
const MAX_TRACE_PRIMARY_SUBJECTS = 8;
const MAX_TRACE_DROP_ENTRIES = 16;
const MAX_TRACE_REJECTION_ENTRIES = 32;
const MAX_FORMATTED_DROP_CAUSES = 4;

export const IMAGE_SEARCH_REQUEST_KINDS = ['primary', 'targeted'] as const;

export const VISUAL_SCENE_SELECTIONS = [
  'article',
  'pool',
  'targeted',
  'pool-fallback',
  'reuse',
  'generated-slide',
  'exhausted',
] as const;

export const VISUAL_SCENE_FALLBACK_REASONS = [
  'subject-not-searched',
  'budget-exhausted',
  'subject-entries-exhausted',
  'pool-exhausted',
  'provider-failure',
] as const;

const countedCauseSchema = z
  .object({
    cause: z.string().min(1).max(80),
    count: z.number().int().nonnegative(),
  })
  .strict();

/** A drop carries the same count under the word the pre-download filter used. */
const countedReasonSchema = z
  .object({
    reason: countedCauseSchema.shape.cause,
    count: countedCauseSchema.shape.count,
  })
  .strict();

const visualImageSearchRequestSchema = z
  .object({
    kind: z.enum(IMAGE_SEARCH_REQUEST_KINDS),
    subjectKey: z.string().min(1).max(320),
    subjectLabel: z.string().min(1).max(320),
    query: z.string().min(1).max(200),
    // Primary requests build the episode pool before any scene owns them, so
    // only a targeted retry can name the scene that asked for it.
    sceneId: z
      .string()
      .regex(/^scene-\d{2}$/)
      .nullable(),
    returned: z.number().int().nonnegative(),
    viable: z.number().int().nonnegative(),
    drops: z.array(countedReasonSchema).max(MAX_TRACE_DROP_ENTRIES),
    error: z.string().min(1).max(300).nullable(),
  })
  .strict();

const visualSceneSelectionSchema = z
  .object({
    sceneId: z.string().regex(/^scene-\d{2}$/),
    subjectKey: z.string().min(1).max(320).nullable(),
    matchedSubjectKey: z.string().min(1).max(320).nullable(),
    selection: z.enum(VISUAL_SCENE_SELECTIONS),
    sourceQuery: z.string().min(1).max(200).nullable(),
    providerRank: z.number().int().nonnegative().nullable(),
    fallbackReason: z.enum(VISUAL_SCENE_FALLBACK_REASONS).nullable(),
    rejections: z.array(countedCauseSchema).max(MAX_TRACE_REJECTION_ENTRIES),
  })
  .strict();

const visualPrimarySubjectSchema = z
  .object({
    subjectKey: z.string().min(1).max(320),
    subjectLabel: z.string().min(1).max(320),
    query: z.string().min(1).max(200),
    sceneCount: z.number().int().nonnegative(),
  })
  .strict();

export const visualImageSearchSchema = z
  .object({
    requestCount: z.number().int().nonnegative(),
    budget: z
      .object({
        primary: z.number().int().nonnegative(),
        targeted: z.number().int().nonnegative(),
        max: z.number().int().nonnegative(),
      })
      .strict(),
    budgetExhausted: z.boolean(),
    primarySubjects: z
      .array(visualPrimarySubjectSchema)
      .max(MAX_TRACE_PRIMARY_SUBJECTS),
    requests: z.array(visualImageSearchRequestSchema).max(MAX_TRACE_REQUESTS),
    /** Scenes a checkpoint already decided. They emit no progress event, so
     * without this count a fully-resumed attempt is indistinguishable from an
     * episode that never searched: zero requests and no scenes. */
    resumedSceneCount: z.number().int().nonnegative(),
    scenes: z.array(visualSceneSelectionSchema).max(MAX_TRACE_SCENES),
  })
  .strict();

export type VisualImageSearch = z.infer<typeof visualImageSearchSchema>;
export type VisualImageSearchRequest = z.infer<
  typeof visualImageSearchRequestSchema
>;
export type VisualSceneSelection = z.infer<typeof visualSceneSelectionSchema>;
export type VisualPrimarySubject = z.infer<typeof visualPrimarySubjectSchema>;
export type ImageSearchRequestKind =
  (typeof IMAGE_SEARCH_REQUEST_KINDS)[number];
export type VisualSceneSelectionKind = (typeof VISUAL_SCENE_SELECTIONS)[number];
export type VisualSceneFallbackReason =
  (typeof VISUAL_SCENE_FALLBACK_REASONS)[number];

export interface ImageSearchBudget {
  primary: number;
  targeted: number;
  max: number;
}

export function createImageSearchTrace(
  budget: ImageSearchBudget,
  resumedSceneCount = 0,
): VisualImageSearch {
  return {
    requestCount: 0,
    budget: { ...budget },
    budgetExhausted: false,
    primarySubjects: [],
    requests: [],
    resumedSceneCount,
    scenes: [],
  };
}

/**
 * Folds one planner progress event into a trace. The processor uses this to
 * rebuild the trace of an attempt that threw before the planner could return
 * one, so it must stay tolerant of events that carry neither field.
 */
export function appendImageSearchProgress(
  trace: VisualImageSearch,
  progress: {
    request?: VisualImageSearchRequest;
    selection?: VisualSceneSelection;
  },
): void {
  if (progress.request) {
    trace.requestCount += 1;
    if (trace.requests.length < MAX_TRACE_REQUESTS) {
      trace.requests.push(progress.request);
    }
    if (trace.requestCount >= trace.budget.max) trace.budgetExhausted = true;
  }
  if (progress.selection) {
    const existing = trace.scenes.findIndex(
      (scene) => scene.sceneId === progress.selection?.sceneId,
    );
    if (existing >= 0) trace.scenes[existing] = progress.selection;
    else if (trace.scenes.length < MAX_TRACE_SCENES) {
      trace.scenes.push(progress.selection);
    }
  }
}

export interface ImageSearchSummary {
  pool: number;
  attempted: number;
  requests: number;
  requestBudget: number;
  returned: number;
  viable: number;
  drops?: ReadonlyMap<string, number>;
}

/** The counts that explain a starved scene, in the order an operator reads
 * them: how much the episode had, how much it tried, what it paid for. */
export function imageSearchSummaryRecord(
  summary: ImageSearchSummary,
): Record<string, number> {
  return {
    pool: summary.pool,
    attempted: summary.attempted,
    requests: summary.requests,
    returned: summary.returned,
    viable: summary.viable,
  };
}

export function formatImageSearchSummary(summary: ImageSearchSummary): string {
  const parts = [
    `pool=${summary.pool}`,
    `attempted=${summary.attempted}`,
    `requests=${summary.requests}/${summary.requestBudget}`,
    `returned=${summary.returned}`,
    `viable=${summary.viable}`,
  ];
  const drops = formatDropCauses(summary.drops);
  if (drops) parts.push(`viableDrops=${drops}`);
  return `[${parts.join(', ')}]`;
}

function formatDropCauses(drops?: ReadonlyMap<string, number>): string | null {
  if (!drops || drops.size === 0) return null;
  return [...drops.entries()]
    .sort(([leftCause, left], [rightCause, right]) =>
      right === left ? leftCause.localeCompare(rightCause) : right - left,
    )
    .slice(0, MAX_FORMATTED_DROP_CAUSES)
    .map(([cause, count]) => `${cause}:${count}`)
    .join(',');
}

export function countedDrops(
  drops: ReadonlyMap<string, number>,
): VisualImageSearchRequest['drops'] {
  return [...drops.entries()]
    .slice(0, MAX_TRACE_DROP_ENTRIES)
    .map(([reason, count]) => ({ reason, count }));
}

export function countedRejections(
  rejections: Readonly<Record<string, number>>,
): VisualSceneSelection['rejections'] {
  return Object.entries(rejections)
    .slice(0, MAX_TRACE_REJECTION_ENTRIES)
    .map(([cause, count]) => ({ cause, count }));
}
