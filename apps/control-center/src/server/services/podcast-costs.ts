import { createClient } from '@supabase/supabase-js';

import type {
  PodcastCostBreakdown,
  PodcastCostResponse,
  PodcastEpisodeCostSummary,
} from '../../shared/types.js';
import type { ControlCenterConfig } from '../config/env.js';

interface PipelineRunRow {
  id: string;
  pipeline: 'ingest' | 'video_render';
  episode_id: string | null;
  status: 'completed' | 'failed';
  started_at: string;
}

interface PipelineStageRow {
  run_id: string;
  episode_id: string | null;
  language_code: string | null;
  stage: string;
  status: 'completed' | 'failed';
  estimated_cost_usd: number | string | null;
  pricing_basis: 'provider_reported' | 'rate_card' | 'unpriced';
  execution_id?: string | null;
  previous_execution_id?: string | null;
  work_key?: string | null;
  execution_mode?: 'executed' | 'reused' | null;
  failure_reason?: string | null;
  deployment_id?: string | null;
}

interface EpisodeRow {
  id: string;
  source_title: string | null;
}

export interface PodcastCostEvidenceFields {
  /** The old retryWasteUsd field, correctly named. */
  failedAttemptCostUsd: number;
  /** Priced attempts carrying explicit runtime interruption evidence. */
  interruptedAttemptCostUsd: number | null;
  confirmedDeploymentInterruptionCostUsd: number;
  shutdownInterruptionCostUsd: number;
  /**
   * Earlier execution cost which has a later executed successor with the exact
   * same work_key. Null means lineage is too incomplete to assert even $0.
   */
  confirmedRetryWasteUsd: number | null;
  confirmedRetryWasteIsLowerBound: boolean;
  unknownLineageStages: number;
  unknownFailureReasonStages: number;
}

export type PodcastEpisodeCostEvidenceSummary = PodcastEpisodeCostSummary &
  PodcastCostEvidenceFields;

export interface PodcastCostEvidenceResponse {
  scope: {
    episodeLimit: number;
    episodeCount: number;
    runCount: number;
    stageCount: number;
    history: 'complete-for-selected-episodes';
  };
  completeness: {
    unpricedStages: number;
    unknownLineageStages: number;
    unknownFailureReasonStages: number;
  };
}

const EPISODE_LIMIT = 25;
const PAGE_SIZE = 500;
const RUN_ID_CHUNK = 100;
const USD_SCALE = 100_000_000;

export function createPodcastCostService(input: {
  config: ControlCenterConfig;
}) {
  return {
    async getPodcastCosts(): Promise<PodcastCostResponse> {
      const generatedAt = new Date().toISOString();
      if (
        !input.config.SUPABASE_URL ||
        !input.config.SUPABASE_SERVICE_ROLE_KEY
      ) {
        return {
          generatedAt,
          status: 'unconfigured',
          message: 'Supabase ops ledger is not connected',
          episodes: [],
        };
      }

      try {
        const client = createClient(
          input.config.SUPABASE_URL,
          input.config.SUPABASE_SERVICE_ROLE_KEY,
          {
            db: { schema: input.config.SUPABASE_DB_SCHEMA },
            auth: { autoRefreshToken: false, persistSession: false },
          },
        );

        const recentEpisodeIds = await loadRecentEpisodeIds(client);
        if (recentEpisodeIds.length === 0) {
          return withEvidence(
            { generatedAt, status: 'ok', message: null, episodes: [] },
            [],
            [],
          );
        }

        // Discovery is bounded to 25 episode ids for the UI, but once selected
        // their execution history is not clipped to the old 200-run/2,000-stage
        // limits. This is required for retry lineage: truncating the predecessor
        // silently turns confirmed waste into an apparent zero.
        const runs = await loadRunsForEpisodes(client, recentEpisodeIds);
        const stages = await loadStagesForRuns(
          client,
          runs.map((run) => run.id),
        );
        const { data: episodeData, error: episodeError } = await client
          .from('episodes')
          .select('id,source_title')
          .in('id', recentEpisodeIds);
        if (episodeError) {
          throw episodeError;
        }

        const titles = new Map(
          ((episodeData ?? []) as EpisodeRow[]).map((row) => [
            row.id,
            row.source_title,
          ]),
        );
        const episodes = summarizePodcastCosts(runs, stages, titles).slice(
          0,
          EPISODE_LIMIT,
        );
        return withEvidence(
          {
            generatedAt,
            status: 'ok',
            message: null,
            episodes,
          },
          runs,
          stages,
        );
      } catch (error) {
        return {
          generatedAt,
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Podcast cost ledger unavailable',
          episodes: [],
        };
      }
    },
  };
}

async function loadRecentEpisodeIds(client: ReturnType<typeof createClient>) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ids.length < EPISODE_LIMIT; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from('ops_pipeline_runs')
      .select('episode_id')
      .not('episode_id', 'is', null)
      .order('started_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw error;
    }
    const rows = (data ?? []) as { episode_id: string | null }[];
    for (const row of rows) {
      if (!row.episode_id || seen.has(row.episode_id)) {
        continue;
      }
      seen.add(row.episode_id);
      ids.push(row.episode_id);
      if (ids.length === EPISODE_LIMIT) {
        break;
      }
    }
    if (rows.length < PAGE_SIZE) {
      break;
    }
  }
  return ids;
}

function requirePage<T>(data: T[] | null, error: unknown): T[] {
  if (error) {
    throw error;
  }
  return data ?? [];
}

async function loadRunsForEpisodes(
  client: ReturnType<typeof createClient>,
  episodeIds: string[],
): Promise<PipelineRunRow[]> {
  const rows: PipelineRunRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await client
      .from('ops_pipeline_runs')
      .select('id,pipeline,episode_id,status,started_at')
      .in('episode_id', episodeIds)
      .order('started_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    const page = requirePage(data as PipelineRunRow[] | null, error);
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      return rows;
    }
  }
}

async function loadStagesForRuns(
  client: ReturnType<typeof createClient>,
  runIds: string[],
): Promise<PipelineStageRow[]> {
  const rows: PipelineStageRow[] = [];
  for (
    let chunkStart = 0;
    chunkStart < runIds.length;
    chunkStart += RUN_ID_CHUNK
  ) {
    const chunk = runIds.slice(chunkStart, chunkStart + RUN_ID_CHUNK);
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await client
        .from('ops_pipeline_stage_runs')
        .select(
          'run_id,episode_id,language_code,stage,status,estimated_cost_usd,pricing_basis,execution_id,previous_execution_id,work_key,execution_mode,failure_reason,deployment_id',
        )
        .in('run_id', chunk)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        throw error;
      }
      const page = (data ?? []) as PipelineStageRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) {
        break;
      }
    }
  }
  return rows;
}

function withEvidence(
  response: PodcastCostResponse,
  runs: PipelineRunRow[],
  stages: PipelineStageRow[],
): PodcastCostResponse {
  const enriched = response.episodes as PodcastEpisodeCostEvidenceSummary[];
  const evidence: PodcastCostEvidenceResponse = {
    scope: {
      episodeLimit: EPISODE_LIMIT,
      episodeCount: enriched.length,
      runCount: runs.length,
      stageCount: stages.length,
      history: 'complete-for-selected-episodes',
    },
    completeness: {
      unpricedStages: enriched.reduce(
        (sum, episode) => sum + episode.unpricedStages,
        0,
      ),
      unknownLineageStages: enriched.reduce(
        (sum, episode) => sum + episode.unknownLineageStages,
        0,
      ),
      unknownFailureReasonStages: enriched.reduce(
        (sum, episode) => sum + episode.unknownFailureReasonStages,
        0,
      ),
    },
  };
  return Object.assign(response, evidence);
}

export function summarizePodcastCosts(
  runs: PipelineRunRow[],
  stages: PipelineStageRow[],
  titles: ReadonlyMap<string, string | null>,
): PodcastEpisodeCostEvidenceSummary[] {
  const runById = new Map(runs.map((run) => [run.id, run]));
  const confirmedWastedExecutions = confirmedRetryExecutions(stages);
  const summaries = new Map<
    string,
    PodcastEpisodeCostEvidenceSummary & {
      breakdownMap: Map<string, PodcastCostBreakdown>;
      totalCostUnits: number;
      podcastCostUnits: number;
      videoCostUnits: number;
      failedAttemptCostUnits: number;
      interruptedAttemptCostUnits: number;
      confirmedDeploymentInterruptionCostUnits: number;
      shutdownInterruptionCostUnits: number;
      confirmedRetryWasteUnits: number;
      lineageObserved: boolean;
    }
  >();

  for (const run of runs) {
    if (!run.episode_id) {
      continue;
    }
    const current = summaries.get(run.episode_id) ?? {
      episodeId: run.episode_id,
      title: titles.get(run.episode_id) ?? null,
      lastRunAt: run.started_at,
      totalCostUsd: 0,
      podcastCostUsd: 0,
      videoCostUsd: 0,
      // Backward-compatible JSON field. Its semantics were always failed-parent
      // spend; callers can migrate off it while the UI stops calling it waste.
      retryWasteUsd: 0,
      failedAttemptCostUsd: 0,
      interruptedAttemptCostUsd: null,
      confirmedDeploymentInterruptionCostUsd: 0,
      shutdownInterruptionCostUsd: 0,
      confirmedRetryWasteUsd: null,
      confirmedRetryWasteIsLowerBound: true,
      unknownLineageStages: 0,
      unknownFailureReasonStages: 0,
      runCount: 0,
      failedRuns: 0,
      unpricedStages: 0,
      breakdown: [],
      breakdownMap: new Map<string, PodcastCostBreakdown>(),
      totalCostUnits: 0,
      podcastCostUnits: 0,
      videoCostUnits: 0,
      failedAttemptCostUnits: 0,
      interruptedAttemptCostUnits: 0,
      confirmedDeploymentInterruptionCostUnits: 0,
      shutdownInterruptionCostUnits: 0,
      confirmedRetryWasteUnits: 0,
      lineageObserved: false,
    };
    current.runCount += 1;
    if (run.status === 'failed') {
      current.failedRuns += 1;
    }
    if (run.started_at > current.lastRunAt) {
      current.lastRunAt = run.started_at;
    }
    summaries.set(run.episode_id, current);
  }

  for (const stage of stages) {
    const run = runById.get(stage.run_id);
    const episodeId = stage.episode_id ?? run?.episode_id ?? null;
    if (!run || !episodeId) {
      continue;
    }
    const summary = summaries.get(episodeId);
    if (!summary) {
      continue;
    }

    if (stage.execution_id) {
      summary.lineageObserved = true;
    }
    if (
      run.pipeline === 'video_render' &&
      stage.estimated_cost_usd !== null &&
      !stage.execution_id
    ) {
      summary.unknownLineageStages += 1;
    }
    if (run.status === 'failed' && !stage.failure_reason) {
      summary.unknownFailureReasonStages += 1;
    }

    if (stage.estimated_cost_usd === null) {
      summary.unpricedStages += 1;
      continue;
    }
    const units = usdUnits(stage.estimated_cost_usd);
    if (units === null) {
      continue;
    }

    summary.totalCostUnits += units;
    if (run.pipeline === 'ingest') {
      summary.podcastCostUnits += units;
    } else {
      summary.videoCostUnits += units;
    }
    if (run.status === 'failed') {
      summary.failedAttemptCostUnits += units;
    }

    if (stage.failure_reason === 'deploy_shutdown') {
      summary.interruptedAttemptCostUnits += units;
      summary.confirmedDeploymentInterruptionCostUnits += units;
    } else if (stage.failure_reason === 'shutdown') {
      summary.interruptedAttemptCostUnits += units;
      summary.shutdownInterruptionCostUnits += units;
    }

    if (
      stage.execution_id &&
      stage.work_key &&
      confirmedWastedExecutions.has(
        executionKey(stage.execution_id, stage.work_key),
      )
    ) {
      summary.confirmedRetryWasteUnits += units;
    }

    const label = breakdownLabel(run, stage);
    const breakdown = summary.breakdownMap.get(label) ?? {
      label,
      costUsd: 0,
      operations: 0,
    };
    breakdown.costUsd = fromUsdUnits(usdUnits(breakdown.costUsd)! + units);
    breakdown.operations += 1;
    summary.breakdownMap.set(label, breakdown);
  }

  return [...summaries.values()]
    .map(({ breakdownMap, ...summary }) => {
      const failedAttemptCostUsd = fromUsdUnits(summary.failedAttemptCostUnits);
      const lineageComplete = summary.unknownLineageStages === 0;
      const confirmedRetryWasteUsd =
        summary.confirmedRetryWasteUnits > 0 || lineageComplete
          ? fromUsdUnits(summary.confirmedRetryWasteUnits)
          : null;
      return {
        ...summary,
        totalCostUsd: fromUsdUnits(summary.totalCostUnits),
        podcastCostUsd: fromUsdUnits(summary.podcastCostUnits),
        videoCostUsd: fromUsdUnits(summary.videoCostUnits),
        retryWasteUsd: failedAttemptCostUsd,
        failedAttemptCostUsd,
        interruptedAttemptCostUsd:
          summary.interruptedAttemptCostUnits > 0
            ? fromUsdUnits(summary.interruptedAttemptCostUnits)
            : summary.unknownFailureReasonStages === 0
              ? 0
              : null,
        confirmedDeploymentInterruptionCostUsd: fromUsdUnits(
          summary.confirmedDeploymentInterruptionCostUnits,
        ),
        shutdownInterruptionCostUsd: fromUsdUnits(
          summary.shutdownInterruptionCostUnits,
        ),
        confirmedRetryWasteUsd,
        confirmedRetryWasteIsLowerBound: !lineageComplete,
        breakdown: [...breakdownMap.values()].sort(
          (left, right) => right.costUsd - left.costUsd,
        ),
      };
    })
    .map((entry) => {
      const stripped: Record<string, unknown> = { ...entry };
      delete stripped['totalCostUnits'];
      delete stripped['podcastCostUnits'];
      delete stripped['videoCostUnits'];
      delete stripped['failedAttemptCostUnits'];
      delete stripped['interruptedAttemptCostUnits'];
      delete stripped['confirmedDeploymentInterruptionCostUnits'];
      delete stripped['shutdownInterruptionCostUnits'];
      delete stripped['confirmedRetryWasteUnits'];
      delete stripped['lineageObserved'];
      return stripped as unknown as PodcastEpisodeCostEvidenceSummary;
    })
    .sort((left, right) => right.lastRunAt.localeCompare(left.lastRunAt));
}

function confirmedRetryExecutions(stages: PipelineStageRow[]): Set<string> {
  const byExecution = new Map<string, Set<string>>();
  for (const stage of stages) {
    if (!stage.execution_id || !stage.work_key) {
      continue;
    }
    const keys = byExecution.get(stage.execution_id) ?? new Set<string>();
    keys.add(stage.work_key);
    byExecution.set(stage.execution_id, keys);
  }

  const confirmed = new Set<string>();
  for (const successor of stages) {
    if (
      !successor.previous_execution_id ||
      !successor.work_key ||
      successor.execution_mode !== 'executed'
    ) {
      continue;
    }
    if (
      byExecution.get(successor.previous_execution_id)?.has(successor.work_key)
    ) {
      confirmed.add(
        executionKey(successor.previous_execution_id, successor.work_key),
      );
    }
  }
  return confirmed;
}

function executionKey(executionId: string, workKey: string): string {
  return `${executionId}\u0000${workKey}`;
}

function usdUnits(value: number | string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.round(parsed * USD_SCALE);
}

function fromUsdUnits(units: number): number {
  return units / USD_SCALE;
}

function breakdownLabel(run: PipelineRunRow, stage: PipelineStageRow): string {
  if (run.pipeline === 'video_render') {
    return stage.language_code
      ? `${stage.language_code} render`
      : 'Shared visual';
  }
  return stage.language_code
    ? `${stage.language_code} ${stage.stage}`
    : stage.stage;
}
