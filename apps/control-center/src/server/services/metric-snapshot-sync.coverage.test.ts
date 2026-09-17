import { describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { syncMetricSnapshots } from './metric-snapshot-sync.js';
import type { MetricSnapshotRepository } from './metric-snapshots.js';

const NOW = new Date('2026-09-17T07:42:00.000Z');

const state = vi.hoisted(() => ({
  costs: { episodes: [] as Array<{ totalCostUsd: number }> },
}));

vi.mock('./operations/aggregate.js', () => ({
  createOperationsService: () => ({
    getGrowth: async () => ({
      journey: {
        landingVisitors30d: 320,
        ctaUsers30d: 0,
        appVisitors30d: 3,
        walletConnectedUsers30d: 0,
      },
    }),
    getOperations: async () => ({
      domains: [{ status: 'healthy' }],
      priorities: [],
      signals: [],
      generatedAt: NOW.toISOString(),
    }),
  }),
}));
vi.mock('./overview.js', () => ({
  createOverviewService: () => ({
    getOverview: async () => ({
      projectedCostUsd: 10,
      generatedAt: NOW.toISOString(),
      product: {
        activePortfolios7d: 1,
        wau: 1,
        mau: 1,
        registeredUsers: 1,
        verifiedWallets: 1,
        portfolioUsers: 1,
        portfolioFresh24h: 1,
        portfolioFresh7d: 1,
        observedPortfolioUsd: 100,
      },
    }),
  }),
}));
vi.mock('./social-growth.js', () => ({
  createSocialGrowthService: () => ({
    getSocialGrowth: async () => ({ platforms: [] }),
  }),
}));
vi.mock('./podcast-pipeline.js', () => ({
  createPodcastPipelineService: () => ({
    getPipeline: async () => ({ episodes: [] }),
  }),
}));
vi.mock('./podcast-costs.js', () => ({
  createPodcastCostService: () => ({
    getPodcastCosts: async () => state.costs,
  }),
}));

describe('metric snapshot sync coverage gaps', () => {
  it('records a null average episode cost when no episode is priced', async () => {
    state.costs = { episodes: [] } as unknown as typeof state.costs;
    const upsert = vi.fn().mockResolvedValue(undefined);
    const repo = { upsert } as unknown as MetricSnapshotRepository;

    const result = await syncMetricSnapshots({
      config: readControlCenterConfig({}),
      now: NOW,
      repository: repo,
    });

    expect(
      upsert.mock.calls.some(
        ([input]) => input.metricKey === 'avg_episode_cost_usd',
      ),
    ).toBe(false);
    expect(result.skipped).toContain('avg_episode_cost_usd');
  });

  it('defaults now when omitted', async () => {
    state.costs = { episodes: [] } as unknown as typeof state.costs;
    const upsert = vi.fn().mockResolvedValue(undefined);
    const repo = { upsert } as unknown as MetricSnapshotRepository;

    const before = new Date();
    const result = await syncMetricSnapshots({
      config: readControlCenterConfig({}),
      repository: repo,
    });
    const after = new Date();

    expect(new Date(result.syncedAt).getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000,
    );
    expect(new Date(result.syncedAt).getTime()).toBeLessThanOrEqual(
      after.getTime() + 1000,
    );
    expect(upsert).toHaveBeenCalled();
  });
});
