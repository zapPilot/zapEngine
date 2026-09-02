import type { StatementsResponse } from '../../../shared/statements.js';
import type { ControlCenterConfig } from '../../config/env.js';
import {
  createMetricSnapshotRepository,
  type MetricSnapshotRepository,
  type MetricSeries,
} from '../metric-snapshots.js';
import type { createOperationsService } from '../operations/aggregate.js';
import type { createOverviewService } from '../overview.js';
import type { createPodcastCostService } from '../podcast-costs.js';
import type { createPodcastPipelineService } from '../podcast-pipeline.js';
import type { createSocialGrowthService } from '../social-growth.js';
import { buildStatements } from './build.js';

/**
 * Every key `ops-cost-sync` writes to `ops.metric_snapshots`. One place, so
 * the sync job and this read path cannot drift on what a key is called.
 */
export const METRIC_KEYS = [
  'active_portfolios_7d',
  'wau',
  'mau',
  'registered',
  'verified_wallets',
  'observed_portfolios',
  'fresh_24h',
  'fresh_7d',
  'observed_aum_usd',
  'followers_rednote',
  'followers_x',
  'followers_youtube',
  'followers_threads',
  'healthy_domains',
  'usage_run_rate_usd',
  'episodes_in_production',
  'avg_episode_cost_usd',
  'retry_share',
] as const;

export function createStatementsService(input: {
  config: ControlCenterConfig;
  service: ReturnType<typeof createOverviewService>;
  operations: ReturnType<typeof createOperationsService>;
  socialGrowth: ReturnType<typeof createSocialGrowthService>;
  podcastPipeline: ReturnType<typeof createPodcastPipelineService>;
  podcastCosts: ReturnType<typeof createPodcastCostService>;
  now?: () => Date;
  metricSnapshots?: MetricSnapshotRepository | null;
}) {
  const now = input.now ?? (() => new Date());
  const metricSnapshots =
    input.metricSnapshots !== undefined
      ? input.metricSnapshots
      : createMetricSnapshotRepository(input.config);

  async function getStatements(force = false): Promise<StatementsResponse> {
    const nowDate = now();
    const [
      operations,
      overview,
      costHistory,
      socialGrowth,
      customers,
      operationsSocial,
      podcastPipeline,
      podcastCosts,
      metricSeries,
    ] = await Promise.all([
      input.operations.getOperations(force),
      input.service.getOverview(force),
      input.service.getCostHistory(),
      input.socialGrowth.getSocialGrowth(force),
      input.operations.getCustomers(force),
      input.operations.getSocial(force),
      input.podcastPipeline.getPipeline(),
      input.podcastCosts.getPodcastCosts(),
      loadMetricSeries(metricSnapshots, nowDate),
    ]);

    return buildStatements({
      now: nowDate,
      operations,
      overview,
      costHistory,
      product: overview.product,
      socialGrowth,
      socialPerformance: overview.social,
      customers,
      operationsSocial,
      podcastPipeline,
      podcastCosts,
      metricSeries,
    });
  }

  return { getStatements };
}

async function loadMetricSeries(
  repository: MetricSnapshotRepository | null,
  now: Date,
): Promise<Map<string, MetricSeries>> {
  const empty = new Map<string, MetricSeries>(
    METRIC_KEYS.map((key) => [
      key,
      { series: [], latest: null, delta7d: null, rowCount: 0 },
    ]),
  );
  if (!repository) {
    return empty;
  }
  try {
    return await repository.loadSeries(METRIC_KEYS, now);
  } catch {
    return empty;
  }
}
