import type { ControlCenterConfig } from '../config/env.js';
import {
  createMetricSnapshotRepository,
  type MetricSnapshotRepository,
} from './metric-snapshots.js';
import { createOperationsService } from './operations/aggregate.js';
import { createOverviewService } from './overview.js';
import { createPodcastCostService } from './podcast-costs.js';
import { createPodcastPipelineService } from './podcast-pipeline.js';
import { createSocialGrowthService } from './social-growth.js';

export interface MetricSnapshotSyncSummary {
  syncedAt: string;
  persisted: number;
  /** Metric keys with no value to persist this run (source null, not a failure). */
  skipped: string[];
}

/**
 * Writes one row per metric key to `ops.metric_snapshots` for today, so every
 * headline number on the redesigned dashboard gets its own 30-day history.
 * Called from the existing `ops:sync` entrypoint (the 04:30 UTC
 * `ops-cost-sync` GitHub Action) rather than a second cron — see
 * apps/control-center/README.md and handoff.md §6.
 */
export async function syncMetricSnapshots(input: {
  config: ControlCenterConfig;
  now?: Date;
  repository?: MetricSnapshotRepository | null;
}): Promise<MetricSnapshotSyncSummary> {
  const now = input.now ?? new Date();
  const repository =
    input.repository ?? createMetricSnapshotRepository(input.config);
  if (!repository) {
    throw new Error('Supabase ops repository is not configured');
  }

  const operations = createOperationsService({ config: input.config });
  const overview = createOverviewService({ config: input.config });
  const socialGrowth = createSocialGrowthService({ config: input.config });
  const podcastPipeline = createPodcastPipelineService({
    config: input.config,
  });
  const podcastCosts = createPodcastCostService({ config: input.config });

  const [
    operationsResponse,
    overviewResponse,
    socialGrowthResponse,
    pipelineResponse,
    costsResponse,
  ] = await Promise.all([
    operations.getOperations(true),
    overview.getOverview(true),
    socialGrowth.getSocialGrowth(true),
    podcastPipeline.getPipeline(),
    podcastCosts.getPodcastCosts(),
  ]);

  const product = overviewResponse.product;
  const healthyDomains = operationsResponse.domains.filter(
    (domain) => domain.status === 'healthy',
  ).length;
  const inProduction = pipelineResponse.episodes.filter(
    (episode) => episode.currentPhase !== 'done',
  ).length;
  const priced = costsResponse.episodes;
  const totalCost = priced.reduce(
    (sum, episode) => sum + episode.totalCostUsd,
    0,
  );
  const totalRetryWaste = priced.reduce(
    (sum, episode) => sum + episode.retryWasteUsd,
    0,
  );
  const avgEpisodeCost = priced.length ? totalCost / priced.length : null;
  const retryShare = totalCost > 0 ? totalRetryWaste / totalCost : null;

  const values: Record<string, number | null> = {
    active_portfolios_7d: product.activePortfolios7d,
    wau: product.wau,
    mau: product.mau,
    registered: product.registeredUsers,
    verified_wallets: product.verifiedWallets,
    observed_portfolios: product.portfolioUsers,
    fresh_24h: product.portfolioFresh24h,
    fresh_7d: product.portfolioFresh7d,
    observed_aum_usd: product.observedPortfolioUsd,
    healthy_domains: healthyDomains,
    usage_run_rate_usd: overviewResponse.projectedCostUsd,
    episodes_in_production: inProduction,
    avg_episode_cost_usd: avgEpisodeCost,
    retry_share: retryShare,
  };
  for (const platform of socialGrowthResponse.platforms) {
    values[`followers_${platform.platform}`] = platform.followersNow;
  }

  const date = now.toISOString().slice(0, 10);
  const fetchedAt = now.toISOString();
  let persisted = 0;
  const skipped: string[] = [];
  for (const [metricKey, value] of Object.entries(values)) {
    if (value === null) {
      skipped.push(metricKey);
      continue;
    }
    try {
      await repository.upsert({ metricKey, date, value, fetchedAt });
      persisted += 1;
    } catch {
      skipped.push(metricKey);
    }
  }

  return { syncedAt: fetchedAt, persisted, skipped };
}
