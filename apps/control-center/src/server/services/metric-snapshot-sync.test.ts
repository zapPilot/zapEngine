import { beforeEach, describe, expect, it, vi } from 'vitest';

import { readControlCenterConfig } from '../config/env.js';
import { syncMetricSnapshots } from './metric-snapshot-sync.js';
import type { MetricSnapshotRepository } from './metric-snapshots.js';

const NOW = new Date('2026-09-17T07:42:00.000Z');

const state = vi.hoisted(() => ({
  memberCount: null as number | null,
  operations: { domains: [{ status: 'healthy' }, { status: 'degraded' }] },
  overview: {
    projectedCostUsd: 60.8 as number | null,
    product: {
      activePortfolios7d: 9,
      wau: 12,
      mau: 31,
      registeredUsers: 87,
      verifiedWallets: 54,
      portfolioUsers: 41,
      portfolioFresh24h: 20 as number | null,
      portfolioFresh7d: 33,
      observedPortfolioUsd: 179_612.34,
    },
  },
  socialGrowth: { platforms: [{ platform: 'x', followersNow: 240 }] },
  pipeline: {
    episodes: [{ currentPhase: 'render' }, { currentPhase: 'done' }],
  },
  costs: { episodes: [{ totalCostUsd: 10, failedAttemptCostUsd: 1 }] },
  failKeys: [] as string[],
}));

vi.mock('./operations/aggregate.js', () => ({
  createOperationsService: () => ({
    getGrowth: async () => ({
      community: { memberCount: state.memberCount },
      journey: {
        landingVisitors30d: 320,
        ctaUsers30d: 0,
        discordCtaUsers30d: 0,
        discordCtaPostWaitlistUsers30d: 0,
        appVisitors30d: 3,
        walletConnectedUsers30d: 0,
      },
    }),
    getOperations: async () => state.operations,
  }),
}));
vi.mock('./overview.js', () => ({
  createOverviewService: () => ({
    getOverview: async () => state.overview,
  }),
}));
vi.mock('./social-growth.js', () => ({
  createSocialGrowthService: () => ({
    getSocialGrowth: async () => state.socialGrowth,
  }),
}));
vi.mock('./podcast-pipeline.js', () => ({
  createPodcastPipelineService: () => ({
    getPipeline: async () => state.pipeline,
  }),
}));
vi.mock('./podcast-costs.js', () => ({
  createPodcastCostService: () => ({
    getPodcastCosts: async () => state.costs,
  }),
}));

function defaults() {
  return {
    memberCount: null as number | null,
    operations: { domains: [{ status: 'healthy' }, { status: 'degraded' }] },
    overview: {
      projectedCostUsd: 60.8 as number | null,
      product: {
        activePortfolios7d: 9,
        wau: 12,
        mau: 31,
        registeredUsers: 87,
        verifiedWallets: 54,
        portfolioUsers: 41,
        portfolioFresh24h: 20 as number | null,
        portfolioFresh7d: 33,
        observedPortfolioUsd: 179_612.34,
      },
    },
    socialGrowth: { platforms: [{ platform: 'x', followersNow: 240 }] },
    pipeline: {
      episodes: [{ currentPhase: 'render' }, { currentPhase: 'done' }],
    },
    costs: { episodes: [{ totalCostUsd: 10, failedAttemptCostUsd: 1 }] },
    failKeys: [] as string[],
  };
}

beforeEach(() => {
  Object.assign(state, defaults());
});

function repository() {
  const upsert = vi.fn(async (input: { metricKey: string }): Promise<void> => {
    if (state.failKeys.includes(input.metricKey)) {
      throw new Error('upsert failed');
    }
  });
  return {
    repo: { upsert } as unknown as MetricSnapshotRepository,
    upsert,
  };
}

describe('syncMetricSnapshots', () => {
  it('persists every valued metric for today', async () => {
    const { repo, upsert } = repository();
    const result = await syncMetricSnapshots({
      config: readControlCenterConfig({}),
      now: NOW,
      repository: repo,
    });

    // 4 growth + 9 product + healthy_domains + run-rate + in-production + avg cost +
    // failed-attempt share + one platform lane.
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ metricKey: 'cta_users_30d', value: 0 }),
    );
    expect(result.persisted).toBe(21);
    expect(result.skipped).toEqual(['discord_members']);
    expect(result.syncedAt).toBe(NOW.toISOString());
    expect(upsert).toHaveBeenCalledTimes(21);
    expect(upsert).toHaveBeenCalledWith({
      metricKey: 'healthy_domains',
      date: '2026-09-17',
      value: 1,
      fetchedAt: NOW.toISOString(),
      versionContext: expect.objectContaining({
        mainSha: null,
        deployments: [],
      }),
    });
    expect(upsert).toHaveBeenCalledWith({
      metricKey: 'followers_x',
      date: '2026-09-17',
      value: 240,
      fetchedAt: NOW.toISOString(),
      versionContext: expect.objectContaining({
        mainSha: null,
        deployments: [],
      }),
    });
    expect(upsert).toHaveBeenCalledWith({
      metricKey: 'failed_attempt_share',
      date: '2026-09-17',
      value: 0.1,
      fetchedAt: NOW.toISOString(),
      versionContext: expect.objectContaining({
        mainSha: null,
        deployments: [],
      }),
    });
  });

  it('skips nulls as missing sources, not failures', async () => {
    state.overview.projectedCostUsd = null;
    state.overview.product.portfolioFresh24h = null;
    const { repo, upsert } = repository();
    const result = await syncMetricSnapshots({
      config: readControlCenterConfig({}),
      now: NOW,
      repository: repo,
    });

    expect(result.persisted).toBe(19);
    expect(result.skipped).toEqual(
      expect.arrayContaining(['usage_run_rate_usd', 'fresh_24h']),
    );
    expect(upsert).toHaveBeenCalledTimes(19);
  });

  it('reports failed writes separately from missing readings', async () => {
    state.failKeys = ['wau'];
    const { repo, upsert } = repository();
    const result = await syncMetricSnapshots({
      config: readControlCenterConfig({}),
      now: NOW,
      repository: repo,
    });

    expect(result.persisted).toBe(20);
    expect(result.skipped).toEqual(['discord_members']);
    expect(result.failed).toEqual(['wau']);
    expect(upsert).toHaveBeenCalledTimes(21);
  });

  it('throws when no ops repository is configured', async () => {
    await expect(
      syncMetricSnapshots({
        config: readControlCenterConfig({}),
        now: NOW,
        repository: null,
      }),
    ).rejects.toThrow('Supabase ops repository is not configured');
  });
  it('persists guild counts independently from CTA intent', async () => {
    state.memberCount = 37;
    const { repo, upsert } = repository();
    const result = await syncMetricSnapshots({
      config: readControlCenterConfig({}),
      now: NOW,
      repository: repo,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ metricKey: 'discord_members', value: 37 }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ metricKey: 'discord_cta_users_30d', value: 0 }),
    );
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        metricKey: 'discord_cta_post_waitlist_users_30d',
        value: 0,
      }),
    );
    expect(result.persisted).toBe(22);
    expect(result.skipped).not.toContain('discord_members');
  });
});
