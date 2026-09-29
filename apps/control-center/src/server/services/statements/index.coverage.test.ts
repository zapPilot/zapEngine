import { describe, expect, it, vi } from 'vitest';

import { unavailableWaitlist } from '../../../shared/waitlist-growth.js';
import {
  OPERATIONS_DOMAINS,
  type CostHistoryResponse,
  type CustomerEconomicsResponse,
  type OperationsResponse,
  type OperationsSocialResponse,
  type OverviewResponse,
  type PodcastCostResponse,
  type ProductHealthResponse,
  type SocialGrowthResponse,
  type SocialPerformanceResponse,
} from '../../../shared/types.js';
import type { PodcastPipelineResponse } from '../../../shared/podcast-pipeline.js';
import { readControlCenterConfig } from '../../config/env.js';
import type { MetricSnapshotRepository } from '../metric-snapshots.js';
import type { createOperationsService } from '../operations/aggregate.js';
import type { createOverviewService } from '../overview.js';
import type { createPodcastCostService } from '../podcast-costs.js';
import type { createPodcastPipelineService } from '../podcast-pipeline.js';
import type { createSocialGrowthService } from '../social-growth.js';
import { createStatementsService, METRIC_KEYS } from './index.js';

const NOW = new Date('2026-09-17T07:42:00.000Z');

function product(): ProductHealthResponse {
  return {
    activePortfolios7d: 9,
    registeredUsers: 87,
    verifiedWallets: 54,
    portfolioUsers: 41,
    observedPortfolioUsd: 179_612.34,
    wau: 12,
    mau: 31,
    portfolioFresh24h: 20,
    portfolioFresh7d: 33,
    top1PortfolioShare: 0.1,
    top3PortfolioShare: 0.2,
  };
}

function overview(): OverviewResponse {
  return {
    generatedAt: NOW.toISOString(),
    accruedCostUsd: 45.26,
    projectedCostUsd: 60.8,
    cashInvoiceSpendUsd: 225,
    aumUsd: 179_612.34,
    activeAccounts: 12,
    socialReach: 1_418,
    product: product(),
    providers: [],
    social: {
      generatedAt: NOW.toISOString(),
      status: 'ok',
      window: 'latest',
      message: null,
      accounts: [],
      decisions: [],
      episodes: [],
    } satisfies SocialPerformanceResponse,
  };
}

function operations(): OperationsResponse {
  return {
    generatedAt: NOW.toISOString(),
    status: 'healthy',
    domains: OPERATIONS_DOMAINS.map((domain) => ({
      domain,
      status: 'healthy' as const,
      signalCount: 0,
    })),
    priorities: [],
    signals: [],
  };
}

function stubs() {
  const getOperations = vi
    .fn<() => Promise<OperationsResponse>>()
    .mockResolvedValue(operations());
  const getCustomers = vi
    .fn<(force?: boolean) => Promise<CustomerEconomicsResponse>>()
    .mockResolvedValue({
      generatedAt: NOW.toISOString(),
      status: 'ok',
      message: null,
      summary: {
        totalCustomers: 87,
        priorityUsers: 5,
        standardUsers: 80,
        pausedUsers: 2,
        activeLast7d: 12,
        inactiveButPriority: 0,
        aumUsd: 179_612.34,
        attributedCostUsd30d: 4.2,
        revenueUsd: null,
      },
      users: [],
    });
  const getSocial = vi
    .fn<(force?: boolean) => Promise<OperationsSocialResponse>>()
    .mockResolvedValue({
      generatedAt: NOW.toISOString(),
      daemon: {
        status: 'healthy',
        owner: 'operator',
        daemonVersion: '1.0.0',
        firstStartedAt: null,
        lastTickStartedAt: null,
        lastTickCompletedAt: null,
        lastSuccessAt: NOW.toISOString(),
        lastError: null,
        staleMinutes: 2,
      },
      jobs: [],
      waitingMedia: {
        lanes: 0,
        rowsRead: 0,
        oldestWaitingSince: null,
        oldestEpisodeId: null,
        oldestLanguageCode: null,
        blockedLanes: 0,
        invalidRows: 0,
        message: null,
      },
      invalidJobRows: 0,
      message: null,
    });
  const getCommunity = vi.fn().mockResolvedValue({ status: 'unavailable' });
  const getOverview = vi
    .fn<(force?: boolean) => Promise<OverviewResponse>>()
    .mockResolvedValue(overview());
  const getCostHistory = vi
    .fn<() => Promise<CostHistoryResponse>>()
    .mockResolvedValue({
      currentMonthDaily: [],
      monthlyTotals: [],
      cashSpendUsd: null,
      previousMonthByProvider: [],
    });
  const getSocialGrowth = vi
    .fn<(force?: boolean) => Promise<SocialGrowthResponse>>()
    .mockResolvedValue({
      status: 'ok',
      message: null,
      generatedAt: NOW.toISOString(),
      platforms: [],
      experiments: [],
      waitlist: unavailableWaitlist('Not collected'),
      attribution: [],
    });
  const getPipeline = vi
    .fn<() => Promise<PodcastPipelineResponse>>()
    .mockResolvedValue({
      generatedAt: NOW.toISOString(),
      status: 'ok',
      message: null,
      episodes: [],
    });
  const getPodcastCosts = vi
    .fn<() => Promise<PodcastCostResponse>>()
    .mockResolvedValue({
      episodes: [],
      generatedAt: NOW.toISOString(),
      status: 'ok',
      message: null,
    });
  return {
    fns: {
      getOperations,
      getCustomers,
      getSocial,
      getCommunity,
      getOverview,
      getCostHistory,
      getSocialGrowth,
      getPipeline,
      getPodcastCosts,
    },
    service: {
      getOverview,
      getCostHistory,
    } as unknown as ReturnType<typeof createOverviewService>,
    operations: {
      getOperations,
      getCustomers,
      getSocial,
      getCommunity,
    } as unknown as ReturnType<typeof createOperationsService>,
    socialGrowth: {
      getSocialGrowth,
    } as unknown as ReturnType<typeof createSocialGrowthService>,
    podcastPipeline: {
      getPipeline,
    } as unknown as ReturnType<typeof createPodcastPipelineService>,
    podcastCosts: {
      getPodcastCosts,
    } as unknown as ReturnType<typeof createPodcastCostService>,
  };
}

function fakeSnapshots(
  loadSeries: MetricSnapshotRepository['loadSeries'],
): MetricSnapshotRepository {
  return { loadSeries, upsert: vi.fn() };
}

describe('createStatementsService coverage', () => {
  it('serves five narrative statements from already-fetched services', async () => {
    const stub = stubs();
    const service = createStatementsService({
      config: readControlCenterConfig({}),
      ...stub,
      now: () => NOW,
      metricSnapshots: null,
    });

    const result = await service.getStatements();

    expect(result.generatedAt).toBe(NOW.toISOString());
    expect(result.statements).toHaveLength(5);
    expect(result.headers.map((h) => h.domain).sort()).toEqual(
      ['growth', 'pipeline', 'product', 'reliability', 'spend'].sort(),
    );
    expect(stub.fns.getOperations).toHaveBeenCalledWith(false);
    expect(stub.fns.getOverview).toHaveBeenCalledWith(false);
    expect(stub.fns.getSocialGrowth).toHaveBeenCalledWith(false);
  });

  it('forwards the force bypass to every source service', async () => {
    const stub = stubs();
    const service = createStatementsService({
      config: readControlCenterConfig({}),
      ...stub,
      now: () => NOW,
      metricSnapshots: null,
    });

    await service.getStatements(true);

    expect(stub.fns.getOperations).toHaveBeenCalledWith(true);
    expect(stub.fns.getOverview).toHaveBeenCalledWith(true);
    expect(stub.fns.getCustomers).toHaveBeenCalledWith(true);
    expect(stub.fns.getSocial).toHaveBeenCalledWith(true);
    expect(stub.fns.getSocialGrowth).toHaveBeenCalledWith(true);
    expect(stub.fns.getCommunity).toHaveBeenCalledWith(true);
    expect(stub.fns.getCostHistory).toHaveBeenCalledWith();
    expect(stub.fns.getPipeline).toHaveBeenCalledWith();
    expect(stub.fns.getPodcastCosts).toHaveBeenCalledWith();
  });

  it('plots persisted metric history instead of the collecting placeholder', async () => {
    const stub = stubs();
    const loadSeries = vi
      .fn<MetricSnapshotRepository['loadSeries']>()
      .mockResolvedValue(
        new Map([
          [
            'active_portfolios_7d',
            {
              series: [6, 7, 7, 8, 8, 9, 9, 9],
              latest: 9,
              delta7d: 3,
              rowCount: 8,
            },
          ],
        ]),
      );
    const service = createStatementsService({
      config: readControlCenterConfig({}),
      ...stub,
      now: () => NOW,
      metricSnapshots: fakeSnapshots(loadSeries),
    });

    const result = await service.getStatements();

    expect(METRIC_KEYS).toContain('active_portfolios_7d');
    expect(loadSeries).toHaveBeenCalledWith(METRIC_KEYS, NOW);
    const productStatement = result.statements.find(
      (s) => s.domain === 'product',
    )!;
    expect(productStatement.delta).toBe('+3 · 7d');
    expect(productStatement.deltaTone).toBe('good');
  });

  it('falls back to empty history when the snapshot read fails', async () => {
    const stub = stubs();
    const loadSeries = vi
      .fn<MetricSnapshotRepository['loadSeries']>()
      .mockRejectedValue(new Error('snapshot store offline'));
    const service = createStatementsService({
      config: readControlCenterConfig({}),
      ...stub,
      now: () => NOW,
      metricSnapshots: fakeSnapshots(loadSeries),
    });

    const result = await service.getStatements();

    expect(result.statements).toHaveLength(5);
    const productStatement = result.statements.find(
      (s) => s.domain === 'product',
    )!;
    expect(productStatement.delta).toContain('collecting');
  });

  it('builds its own repository from config when none is injected', async () => {
    const stub = stubs();
    const service = createStatementsService({
      config: readControlCenterConfig({}),
      ...stub,
    });

    const result = await service.getStatements();

    expect(result.statements).toHaveLength(5);
    expect(result.headers).toHaveLength(5);
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
  });
});
