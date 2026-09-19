import {
  readMetricVersionContext,
  type MetricVersionContext,
} from './metric-version-context.js';
import { podcastCostEvidenceTotals } from '../../shared/podcast-cost-evidence.js';
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
  failed: string[];
  versionContext: MetricVersionContext;
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
  versionContext?: MetricVersionContext;
}): Promise<MetricSnapshotSyncSummary> {
  const now = input.now ?? new Date();
  const repository =
    input.repository ?? createMetricSnapshotRepository(input.config);
  if (!repository) {
    throw new Error('Supabase ops repository is not configured');
  }

  const overview = createOverviewService({ config: input.config });
  const socialGrowth = createSocialGrowthService({ config: input.config });
  const operations = createOperationsService({
    config: input.config,
    socialGrowth,
  });
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
    growthResponse,
  ] = await Promise.all([
    operations.getOperations(true),
    overview.getOverview(true),
    socialGrowth.getSocialGrowth(true),
    podcastPipeline.getPipeline(),
    podcastCosts.getPodcastCosts(),
    operations.getGrowth(true),
  ]);

  const versionContext =
    input.versionContext ??
    (await readMetricVersionContext({ config: input.config, now }));

  const product = overviewResponse.product;
  const healthyDomains = operationsResponse.domains.filter(
    (domain) => domain.status === 'healthy',
  ).length;
  const inProduction = pipelineResponse.episodes.filter(
    (episode) => episode.currentPhase !== 'done',
  ).length;
  const priced = costsResponse.episodes;
  const evidence = podcastCostEvidenceTotals(priced);
  const avgEpisodeCost = priced.length
    ? evidence.totalCostUsd / priced.length
    : null;

  const values: Record<string, number | null> = {
    landing_visitors_30d: growthResponse.journey.landingVisitors30d,
    cta_users_30d: growthResponse.journey.ctaUsers30d,
    discord_cta_users_30d: growthResponse.journey.discordCtaUsers30d,
    discord_cta_post_waitlist_users_30d:
      growthResponse.journey.discordCtaPostWaitlistUsers30d,
    discord_members: growthResponse.community.memberCount,
    app_visitors_30d: growthResponse.journey.appVisitors30d,
    wallet_connected_users_30d: growthResponse.journey.walletConnectedUsers30d,
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
    failed_attempt_share: evidence.failedAttemptShare,
  };
  for (const platform of socialGrowthResponse.platforms) {
    values[`followers_${platform.platform}`] = platform.followersNow;
  }

  const date = now.toISOString().slice(0, 10);
  const fetchedAt = now.toISOString();
  let persisted = 0;
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const [metricKey, value] of Object.entries(values)) {
    if (value === null) {
      skipped.push(metricKey);
      continue;
    }
    try {
      await repository.upsert({
        metricKey,
        date,
        value,
        fetchedAt,
        versionContext,
      });
      persisted += 1;
    } catch {
      failed.push(metricKey);
    }
  }

  return { syncedAt: fetchedAt, persisted, skipped, failed, versionContext };
}
