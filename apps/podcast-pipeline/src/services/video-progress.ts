import type { EpisodeVideoJobStatus } from './video-jobs.js';

/**
 * Stage vocabulary and weights for video-generation progress.
 *
 * This module is the single source of truth for both sides of the contract:
 * the worker writes job-local percentages through it, and the API composes the
 * public number through it. Splitting the weights across writer and reader is
 * how the bar silently starts disagreeing with the pipeline.
 */

/** Stages the visual job can persist. Mirrored by a CHECK in migration 023. */
export const VISUAL_JOB_PROGRESS_STAGES = [
  'analyzing-audio',
  'planning-scenes',
  'selecting-images',
  'uploading-visuals',
] as const;

/** Stages the render job can persist. Mirrored by a CHECK in migration 023. */
export const RENDER_JOB_PROGRESS_STAGES = [
  'analyzing-audio',
  'aligning-script',
  'preparing-media',
  'encoding',
  'uploading-video',
] as const;

export type VisualJobProgressStage =
  (typeof VISUAL_JOB_PROGRESS_STAGES)[number];
export type RenderJobProgressStage =
  (typeof RENDER_JOB_PROGRESS_STAGES)[number];

/**
 * `waiting-for-renderer` is derived by the API and never stored: it is the gap
 * between a completed visual checkpoint and a render machine picking the job up.
 */
export type EpisodeVideoProgressStage =
  | VisualJobProgressStage
  | RenderJobProgressStage
  | 'waiting-for-renderer';

/**
 * Job-local span each stage occupies, as a percentage of its own job.
 * `analyzing-audio` is shared by both jobs and occupies the same span in each,
 * so one flat table covers both without a second copy to drift against.
 */
const STAGE_SPANS: Record<
  VisualJobProgressStage | RenderJobProgressStage,
  { start: number; end: number }
> = {
  'analyzing-audio': { start: 0, end: 5 },
  // Visual job.
  'planning-scenes': { start: 5, end: 15 },
  'selecting-images': { start: 15, end: 90 },
  'uploading-visuals': { start: 90, end: 100 },
  // Render job.
  'aligning-script': { start: 5, end: 15 },
  'preparing-media': { start: 15, end: 35 },
  encoding: { start: 35, end: 92 },
  'uploading-video': { start: 92, end: 100 },
};

/** The visual checkpoint owns 0-40 of the composed bar; the render owns 40-100. */
export const VISUAL_PHASE_WEIGHT = 0.4;

/**
 * A queued job reports a small floor rather than 0. The render group is started
 * on demand, so "queued" routinely means a machine is booting; a hard 0 reads as
 * "nothing has happened" for the whole wake-up window.
 */
const QUEUED_FLOOR_PERCENT = 2;

/** 100 is reserved for `completed`, so an in-flight job never claims it. */
const IN_FLIGHT_CEILING_PERCENT = 99;

export interface EpisodeVideoProgressUpdate {
  percent: number;
  stage: VisualJobProgressStage | RenderJobProgressStage;
}

/** A job row reduced to just what progress composition needs. */
export interface EpisodeVideoProgressJobState {
  status: EpisodeVideoJobStatus;
  progressPercent: number | null;
  progressStage: string | null;
  updatedAt: string | null;
}

export interface EpisodeVideoProgressComposition {
  progressPercent: number;
  stage: EpisodeVideoProgressStage | null;
  /**
   * Newest timestamp across the rows that fed the composition. During the
   * visual phase the render row has not been touched since it was enqueued, so
   * returning its `updated_at` alone would freeze the client's freshness check.
   */
  updatedAt: string | null;
}

export function visualStageProgress(
  stage: VisualJobProgressStage,
  fraction = 1,
): EpisodeVideoProgressUpdate {
  return { percent: stageProgressPercent(stage, fraction), stage };
}

export function renderStageProgress(
  stage: RenderJobProgressStage,
  fraction = 1,
): EpisodeVideoProgressUpdate {
  return { percent: stageProgressPercent(stage, fraction), stage };
}

/**
 * Position within a job, 0-100. `fraction` is how far through the stage the job
 * is (scene i of n, encoded seconds of total); omit it to report the stage's end.
 */
function stageProgressPercent(
  stage: VisualJobProgressStage | RenderJobProgressStage,
  fraction: number,
): number {
  const span = STAGE_SPANS[stage];
  const bounded = clamp(fraction, 0, 1);
  return Math.round(span.start + (span.end - span.start) * bounded);
}

export function composeEpisodeVideoProgress(input: {
  render: EpisodeVideoProgressJobState | null;
  visual: EpisodeVideoProgressJobState | null;
}): EpisodeVideoProgressComposition {
  const { render, visual } = input;
  if (!render) return { progressPercent: 0, stage: null, updatedAt: null };

  if (render.status === 'completed') {
    return { progressPercent: 100, stage: null, updatedAt: render.updatedAt };
  }

  if (render.status !== 'queued') {
    // 'processing', or 'failed' with whatever the last flush persisted.
    return {
      progressPercent: renderPhasePercent(render.progressPercent),
      stage:
        render.status === 'failed'
          ? null
          : storedStage(render.progressStage, RENDER_JOB_PROGRESS_STAGES),
      updatedAt: render.updatedAt,
    };
  }

  // Queued render: the visual checkpoint is where the work actually is.
  const queuedAt = { progressPercent: QUEUED_FLOOR_PERCENT, stage: null };
  if (!visual) return { ...queuedAt, updatedAt: render.updatedAt };

  const updatedAt = newerTimestamp(render.updatedAt, visual.updatedAt);
  if (visual.status === 'completed') {
    return {
      progressPercent: Math.round(VISUAL_PHASE_WEIGHT * 100),
      stage: 'waiting-for-renderer',
      updatedAt,
    };
  }
  if (visual.status === 'queued') return { ...queuedAt, updatedAt };

  return {
    progressPercent: visualPhasePercent(visual.progressPercent),
    stage:
      visual.status === 'failed'
        ? null
        : storedStage(visual.progressStage, VISUAL_JOB_PROGRESS_STAGES),
    updatedAt,
  };
}

function renderPhasePercent(jobPercent: number | null): number {
  const floor = VISUAL_PHASE_WEIGHT * 100;
  const scaled =
    floor + (1 - VISUAL_PHASE_WEIGHT) * clamp(jobPercent ?? 0, 0, 100);
  return Math.min(IN_FLIGHT_CEILING_PERCENT, Math.round(scaled));
}

function visualPhasePercent(jobPercent: number | null): number {
  const ceiling = VISUAL_PHASE_WEIGHT * 100;
  const span = ceiling - QUEUED_FLOOR_PERCENT;
  const scaled =
    QUEUED_FLOOR_PERCENT + (span / 100) * clamp(jobPercent ?? 0, 0, 100);
  // Stay strictly below the visual-complete value so the bar never implies the
  // checkpoint landed while image selection is still running.
  return Math.min(ceiling - 1, Math.round(scaled));
}

/**
 * A stored stage outside the caller's whitelist means a newer worker wrote the
 * row. Degrade to "percentage without a label" rather than leaking a slug the
 * client cannot translate.
 */
function storedStage<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | null {
  return value !== null && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function newerTimestamp(
  left: string | null,
  right: string | null,
): string | null {
  if (left === null) return right;
  if (right === null) return left;
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (Number.isNaN(leftMs)) return right;
  if (Number.isNaN(rightMs)) return left;
  return rightMs > leftMs ? right : left;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
