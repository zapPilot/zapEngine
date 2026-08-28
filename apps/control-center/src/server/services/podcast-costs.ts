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
}

interface EpisodeRow {
  id: string;
  source_title: string | null;
}

const RUN_LIMIT = 200;
const EPISODE_LIMIT = 25;

export function createPodcastCostService(input: { config: ControlCenterConfig }) {
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
        const { data: runData, error: runError } = await client
          .from('ops_pipeline_runs')
          .select('id,pipeline,episode_id,status,started_at')
          .not('episode_id', 'is', null)
          .order('started_at', { ascending: false })
          .limit(RUN_LIMIT);
        if (runError) throw runError;

        const runs = (runData ?? []) as PipelineRunRow[];
        if (runs.length === 0) {
          return { generatedAt, status: 'ok', message: null, episodes: [] };
        }

        const runIds = runs.map(({ id }) => id);
        const recentEpisodeIds = [
          ...new Set(
            runs.flatMap((run) => (run.episode_id ? [run.episode_id] : [])),
          ),
        ].slice(0, EPISODE_LIMIT);
        const [
          { data: stageData, error: stageError },
          { data: episodeData, error: episodeError },
        ] = await Promise.all([
          client
            .from('ops_pipeline_stage_runs')
            .select(
              'run_id,episode_id,language_code,stage,status,estimated_cost_usd,pricing_basis',
            )
            .in('run_id', runIds)
            .limit(2_000),
          client
            .from('episodes')
            .select('id,source_title')
            .in('id', recentEpisodeIds),
        ]);
        if (stageError) throw stageError;
        if (episodeError) throw episodeError;

        const titles = new Map(
          ((episodeData ?? []) as EpisodeRow[]).map((row) => [
            row.id,
            row.source_title,
          ]),
        );
        return {
          generatedAt,
          status: 'ok',
          message: null,
          episodes: summarizePodcastCosts(
            runs,
            (stageData ?? []) as PipelineStageRow[],
            titles,
          ).slice(0, EPISODE_LIMIT),
        };
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

export function summarizePodcastCosts(
  runs: PipelineRunRow[],
  stages: PipelineStageRow[],
  titles: ReadonlyMap<string, string | null>,
): PodcastEpisodeCostSummary[] {
  const runById = new Map(runs.map((run) => [run.id, run]));
  const summaries = new Map<
    string,
    PodcastEpisodeCostSummary & {
      breakdownMap: Map<string, PodcastCostBreakdown>;
    }
  >();

  for (const run of runs) {
    if (!run.episode_id) continue;
    const current = summaries.get(run.episode_id) ?? {
      episodeId: run.episode_id,
      title: titles.get(run.episode_id) ?? null,
      lastRunAt: run.started_at,
      totalCostUsd: 0,
      podcastCostUsd: 0,
      videoCostUsd: 0,
      retryWasteUsd: 0,
      runCount: 0,
      failedRuns: 0,
      unpricedStages: 0,
      breakdown: [],
      breakdownMap: new Map<string, PodcastCostBreakdown>(),
    };
    current.runCount += 1;
    if (run.status === 'failed') current.failedRuns += 1;
    if (run.started_at > current.lastRunAt) current.lastRunAt = run.started_at;
    summaries.set(run.episode_id, current);
  }

  for (const stage of stages) {
    const run = runById.get(stage.run_id);
    const episodeId = stage.episode_id ?? run?.episode_id ?? null;
    if (!run || !episodeId) continue;
    const summary = summaries.get(episodeId);
    if (!summary) continue;

    if (stage.estimated_cost_usd === null) {
      summary.unpricedStages += 1;
      continue;
    }
    const costUsd = Number(stage.estimated_cost_usd);
    if (!Number.isFinite(costUsd)) continue;

    summary.totalCostUsd += costUsd;
    if (run.pipeline === 'ingest') {
      summary.podcastCostUsd += costUsd;
    } else {
      summary.videoCostUsd += costUsd;
    }
    if (run.status === 'failed') {
      summary.retryWasteUsd += costUsd;
    }

    const label = breakdownLabel(run, stage);
    const breakdown = summary.breakdownMap.get(label) ?? {
      label,
      costUsd: 0,
      operations: 0,
    };
    breakdown.costUsd += costUsd;
    breakdown.operations += 1;
    summary.breakdownMap.set(label, breakdown);
  }

  return [...summaries.values()]
    .map(({ breakdownMap, ...summary }) => ({
      ...summary,
      breakdown: [...breakdownMap.values()].sort(
        (left, right) => right.costUsd - left.costUsd,
      ),
    }))
    .sort((left, right) => right.lastRunAt.localeCompare(left.lastRunAt));
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
