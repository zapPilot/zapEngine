import { randomUUID } from 'node:crypto';

import {
  capturePipelineException,
  type PipelineComponent,
} from '../observability/sentry.js';
import {
  classifyCostGroup,
  compactUsageCostLines,
  type UsageCostGroup,
  type UsageCostLine,
} from './cost.js';
import type { LlmAttemptRecord } from './llm.js';
import { getPipelineSupabase, throwSupabaseError } from './supabase-client.js';

/**
 * The Fly machine shape the `render` process group runs on. Fly exposes no
 * runtime environment variable for it, so it is a constant here and
 * `ops-ledger.test.ts` parses fly.toml to prove the two still agree. Without
 * that test a resize would keep pricing renders at the old rate with nothing
 * going red — the ledger would stay green while quietly reporting the wrong
 * number, which is the failure this whole feature exists to end.
 */
export const RENDER_MACHINE_SHAPE = 'performance-2x-4gb';
export const RENDER_PRICING_METRIC_KEY = 'machine_second_performance_2x_4gb';

/**
 * A billable stage of one pipeline run. The ingest groups are exactly
 * {@link classifyCostGroup}'s, so the Telegram cost summary and the ledger can
 * never disagree about which stage a cost line belongs to.
 */
export type PipelineStage = UsageCostGroup | 'video_render';

export type PipelineStageStatus = 'completed' | 'failed';

export type PipelineKind = 'ingest' | 'video_render';

export type PipelineTrigger = 'http' | 'telegram' | 'worker';

export interface PipelineStagePricing {
  /** Resolved against versioned `ops.cost_rates` rows inside the RPC. */
  metricKey: string;
  quantity: number;
}

interface PipelineStageRunFields {
  stage: PipelineStage;
  provider: string;
  status: PipelineStageStatus;
  model?: string;
  episodeId?: string;
  localizationId?: string;
  languageCode?: string;
  attempt?: number;
  startedAt?: Date;
  finishedAt?: Date;
  elapsedMs?: number;
  usage?: Record<string, string | number>;
}

/**
 * Cost is either a provider-reported amount or a rate-card quantity, never
 * both — the union is what stops a caller from supplying two answers to the
 * same question. A stage with neither is recorded as `unpriced`.
 */
export type PipelineStageRunInput = PipelineStageRunFields &
  (
    | { reportedCostUsd: number; pricing?: never }
    | { pricing: PipelineStagePricing; reportedCostUsd?: never }
    | { reportedCostUsd?: never; pricing?: never }
  );

export interface PipelineRunInput {
  /** Client-generated UUID; the RPC ignores a resend of one already recorded. */
  runId: string;
  pipeline: PipelineKind;
  /** The short run id printed on this run's log lines. */
  runRef: string;
  trigger: PipelineTrigger;
  status: PipelineStageStatus;
  startedAt: Date;
  finishedAt: Date;
  episodeId?: string | null;
  stages: PipelineStageRunInput[];
  /** Sentry tag used when the ledger write itself fails. */
  component: PipelineComponent;
}

export function videoRenderRunBase(input: {
  runRef: string;
  status: PipelineStageStatus;
  startedAt: Date;
  finishedAt?: Date;
  episodeId?: string | null;
}): Omit<PipelineRunInput, 'component' | 'stages'> {
  return {
    runId: randomUUID(),
    pipeline: 'video_render',
    runRef: input.runRef,
    trigger: 'worker',
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt ?? new Date(),
    episodeId: input.episodeId ?? null,
  };
}

/**
 * Persists one run and its stages to the operations ledger.
 *
 * Never throws. Observability must not be able to fail work that already
 * succeeded — a render that finished is finished whether or not its cost was
 * recorded. It is reported at `warning` rather than swallowed, because a ledger
 * that silently never writes looks exactly like a pipeline that never ran.
 */
export async function recordPipelineRun(
  input: PipelineRunInput,
): Promise<void> {
  try {
    const { error } = await getPipelineSupabase().rpc(
      'ops_record_pipeline_run',
      {
        p_run_id: input.runId,
        p_pipeline: input.pipeline,
        p_run_ref: input.runRef,
        p_episode_id: input.episodeId ?? null,
        p_trigger: input.trigger,
        p_status: input.status,
        p_started_at: input.startedAt.toISOString(),
        p_finished_at: input.finishedAt.toISOString(),
        p_stages: input.stages.map(toStagePayload),
      },
    );
    if (error) throwSupabaseError(error);
  } catch (error) {
    console.error('[ops-ledger] pipeline run not recorded', {
      pipeline: input.pipeline,
      runRef: input.runRef,
      episodeId: input.episodeId ?? null,
      stageCount: input.stages.length,
      error,
    });
    capturePipelineException(error, {
      component: input.component,
      tags: { ledger: 'pipeline-run', pipeline: input.pipeline },
      context: {
        runId: input.runId,
        runRef: input.runRef,
        episodeId: input.episodeId ?? null,
        stageCount: input.stages.length,
      },
      level: 'warning',
    });
  }
}

export interface CostLineStageContext {
  languageCode: string;
  episodeId?: string;
  localizationId?: string;
  status: PipelineStageStatus;
}

/**
 * Maps one localization's raw cost lines onto ledger stage rows.
 *
 * Compaction runs per call, so two languages that produced an identical line
 * stay two rows — merging them would erase exactly the per-language breakdown
 * the ledger exists to provide.
 *
 * The `script` group is deliberately dropped: a cost line is one number per
 * localization, so it cannot say how many upstream requests were made or how
 * long any of them ran, and those are the facts a timed-out generation has to
 * leave behind. {@link stageRunsFromLlmAttempts} writes those rows instead —
 * emitting both would double-count the same spend.
 */
export function stageRunsFromCostLines(
  lines: UsageCostLine[],
  context: CostLineStageContext,
): PipelineStageRunInput[] {
  const priced = lines.filter((line) => classifyCostGroup(line) !== 'script');
  return compactUsageCostLines(priced).map((line) => ({
    stage: classifyCostGroup(line),
    provider: line.provider,
    model: line.model,
    episodeId: context.episodeId,
    localizationId: context.localizationId,
    languageCode: context.languageCode,
    status: context.status,
    usage: line.usage
      ? {
          unit: line.usage.unit,
          quantity: line.usage.quantity,
          unitPriceUsd: line.usage.unitPriceUsd,
        }
      : undefined,
    reportedCostUsd: line.costUsd,
  }));
}

export interface LlmAttemptStageContext {
  languageCode: string;
  episodeId?: string;
  localizationId?: string;
}

/**
 * One ledger row per upstream LLM request, successful or not.
 *
 * A failed attempt is the row that matters most here: `pipeline_stage_runs`
 * could always express one, but nothing produced it, so a generation that
 * burned four minutes and then timed out left the ledger looking like it had
 * never started. `usage` carries the per-attempt facts -- deadline, routing,
 * token counts, why it failed -- that no cost line has room for.
 */
export function stageRunsFromLlmAttempts(
  attempts: readonly LlmAttemptRecord[],
  context: LlmAttemptStageContext,
): PipelineStageRunInput[] {
  return attempts.map((record) => {
    const stage: PipelineStageRunFields = {
      stage: 'script',
      provider: record.provider ?? 'unknown',
      model: record.model,
      status: record.status,
      episodeId: context.episodeId,
      localizationId: context.localizationId,
      languageCode: context.languageCode,
      attempt: record.attempt,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
      elapsedMs: record.elapsedMs,
      usage: {
        timeoutMs: record.timeoutMs,
        inputChars: record.inputChars,
        routing: record.routing,
        ...definedFields({
          outputChars: record.outputChars,
          promptTokens: record.promptTokens,
          completionTokens: record.completionTokens,
          generationId: record.generationId,
          errorCategory: record.errorCategory,
          errorMessage: record.errorMessage,
        }),
      },
    };
    // A failed attempt has no provider-reported cost, and inventing a zero
    // would make it indistinguishable from a free success on the cost report.
    return record.costUsd === null
      ? stage
      : { ...stage, reportedCostUsd: record.costUsd };
  });
}

function definedFields(
  fields: Record<string, string | number | null>,
): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]) =>
      value === null ? [] : [[key, value] as const],
    ),
  );
}

/**
 * What one video render measured about itself. Produced in the processor's
 * `finally` so a failed render reports it too, then logged as
 * `video:render-metrics` and written to the ledger from the same object.
 */
export interface EpisodeRenderMetrics {
  status: PipelineStageStatus;
  wallMs: number;
  durationMs: number;
  narrationDownloadMs: number;
  mediaMs?: number;
  chunkEncodeMs?: number;
  finalEncodeMs?: number;
  downscaleMs?: number;
  realtimeFactor: number;
  nodeRssMb: number;
  cgroupCurrentMb?: number;
  cgroupPeakObservedMb?: number;
}

export interface RenderStageRunInput {
  metrics: EpisodeRenderMetrics;
  /** When the processor handed the metrics over; the encode's end instant. */
  reportedAt: Date;
  episodeId: string;
  localizationId: string;
  languageCode: string;
  attempt: number;
  /** Claim to release, not just the encode — see `usage.jobWallMs` below. */
  jobWallMs: number;
}

/**
 * Prices one render against the Fly rate card.
 *
 * `elapsed_ms` and the billed quantity are the encode window only, because that
 * is the number `fly.toml`'s "until production telemetry proves a smaller shape
 * is cheaper" note has to be settled against. The wider claim-to-release span
 * is carried as `usage.jobWallMs`: narration download, alignment and upload
 * hold the same dedicated CPU, so the difference between the two is the
 * under-attribution a Fly invoice will show.
 */
export function renderStageRun(
  input: RenderStageRunInput,
): PipelineStageRunInput {
  const { metrics } = input;
  return {
    stage: 'video_render',
    provider: 'fly',
    status: metrics.status,
    episodeId: input.episodeId,
    localizationId: input.localizationId,
    languageCode: input.languageCode,
    attempt: input.attempt,
    startedAt: new Date(input.reportedAt.getTime() - metrics.wallMs),
    finishedAt: input.reportedAt,
    elapsedMs: metrics.wallMs,
    usage: {
      machine: RENDER_MACHINE_SHAPE,
      jobWallMs: input.jobWallMs,
      durationMs: metrics.durationMs,
      narrationDownloadMs: metrics.narrationDownloadMs,
      realtimeFactor: metrics.realtimeFactor,
      nodeRssMb: metrics.nodeRssMb,
      ...definedNumbers({
        mediaMs: metrics.mediaMs,
        chunkEncodeMs: metrics.chunkEncodeMs,
        finalEncodeMs: metrics.finalEncodeMs,
        downscaleMs: metrics.downscaleMs,
        cgroupCurrentMb: metrics.cgroupCurrentMb,
        cgroupPeakObservedMb: metrics.cgroupPeakObservedMb,
      }),
    },
    pricing: {
      metricKey: RENDER_PRICING_METRIC_KEY,
      quantity: metrics.wallMs / 1_000,
    },
  };
}

function definedNumbers(
  fields: Record<string, number | undefined>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(fields).flatMap(([key, value]) =>
      value === undefined ? [] : [[key, value] as const],
    ),
  );
}

function toStagePayload(stage: PipelineStageRunInput): Record<string, unknown> {
  return {
    episode_id: stage.episodeId ?? null,
    localization_id: stage.localizationId ?? null,
    language_code: stage.languageCode ?? null,
    stage: stage.stage,
    provider: stage.provider,
    model: stage.model ?? null,
    attempt: stage.attempt ?? 1,
    status: stage.status,
    started_at: stage.startedAt?.toISOString() ?? null,
    finished_at: stage.finishedAt?.toISOString() ?? null,
    elapsed_ms: stage.elapsedMs ?? null,
    usage: stage.usage ?? {},
    ...pricingPayload(stage),
  };
}

function pricingPayload(stage: PipelineStageRunInput): Record<string, unknown> {
  if (stage.reportedCostUsd !== undefined) {
    return {
      pricing_basis: 'provider_reported',
      reported_cost_usd: stage.reportedCostUsd,
      pricing_metric_key: null,
      quantity: null,
    };
  }
  if (stage.pricing) {
    return {
      pricing_basis: 'rate_card',
      reported_cost_usd: null,
      pricing_metric_key: stage.pricing.metricKey,
      quantity: stage.pricing.quantity,
    };
  }
  return {
    pricing_basis: 'unpriced',
    reported_cost_usd: null,
    pricing_metric_key: null,
    quantity: null,
  };
}
