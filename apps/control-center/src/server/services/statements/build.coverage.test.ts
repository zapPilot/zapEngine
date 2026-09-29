import { describe, expect, it } from 'vitest';

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
import { buildStatements } from './build.js';
import type { StatementInputs } from './types.js';

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
    top1PortfolioShare: 0.42,
    top3PortfolioShare: 0.71,
  };
}

function socialPerformance(): SocialPerformanceResponse {
  return {
    generatedAt: NOW.toISOString(),
    status: 'ok',
    window: 'latest',
    message: null,
    accounts: [],
    decisions: [],
    episodes: [],
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
    providers: [
      {
        provider: 'openrouter',
        label: 'OpenRouter',
        status: 'ok',
        costType: 'actual',
        snapshot: {
          provider: 'openrouter',
          periodStart: '2026-09-01T00:00:00.000Z',
          periodEnd: NOW.toISOString(),
          accruedCostUsd: 11.2,
          projectedCostUsd: 17.4,
          costType: 'actual',
          source: 'api',
          usage: [],
          fetchedAt: NOW.toISOString(),
        },
        message: null,
      },
    ],
    social: socialPerformance(),
  };
}

function operations(): OperationsResponse {
  const signal = {
    fingerprint: 'fly:process-group/from-fed-to-chain-api/app',
    source: 'fly' as const,
    domain: 'infra' as const,
    status: 'critical' as const,
    title: 'from-fed-to-chain-api app has no started Machine',
    detail: null,
    evidence: { startedMachines: 0, criticalSinceMinutes: 134 },
    observedAt: NOW.toISOString(),
    url: 'https://fly.io/apps/from-fed-to-chain-api',
  };
  return {
    generatedAt: NOW.toISOString(),
    status: 'critical',
    domains: OPERATIONS_DOMAINS.map((domain, index) => ({
      domain,
      status: index === 0 ? ('critical' as const) : ('healthy' as const),
      signalCount: 1,
    })),
    priorities: [{ signal, score: 78, reasons: ['critical infra signal'] }],
    signals: [signal],
  };
}

function inputs(overrides: Partial<StatementInputs> = {}): StatementInputs {
  return {
    now: NOW,
    operations: operations(),
    overview: overview(),
    costHistory: {
      currentMonthDaily: [],
      monthlyTotals: [{ month: '2026-08', accruedCostUsd: 51.4 }],
      cashSpendUsd: 225,
      previousMonthByProvider: [
        { provider: 'openrouter', accruedCostUsd: 11.2 },
      ],
    } satisfies CostHistoryResponse,
    product: product(),
    socialGrowth: {
      status: 'ok',
      message: null,
      generatedAt: NOW.toISOString(),
      platforms: [
        {
          platform: 'rednote',
          followersNow: 964,
          followersDelta24h: 3,
          followersDelta7d: 21,
          exactSubscribersGained7d: null,
          lanes: [],
        },
        {
          platform: 'x',
          followersNow: 240,
          followersDelta24h: 0,
          followersDelta7d: 2,
          exactSubscribersGained7d: null,
          lanes: [],
        },
      ],
      experiments: [],
      waitlist: unavailableWaitlist('Not collected'),
      attribution: [],
    } satisfies SocialGrowthResponse,
    socialPerformance: socialPerformance(),
    customers: {
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
    } satisfies CustomerEconomicsResponse,
    operationsSocial: {
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
    } satisfies OperationsSocialResponse,
    podcastPipeline: {
      generatedAt: NOW.toISOString(),
      status: 'ok',
      message: null,
      episodes: [],
    } satisfies PodcastPipelineResponse,
    podcastCosts: {
      episodes: [],
      generatedAt: NOW.toISOString(),
      status: 'ok',
      message: null,
    } satisfies PodcastCostResponse,
    community: {
      status: 'unavailable',
      message: 'not configured',
      inviteCode: null,
      guildId: null,
      guildName: null,
      memberCount: null,
      presenceCount: null,
      inviteExpiresAt: null,
      observedAt: '2026-09-19T00:00:00Z',
    },
    metricSeries: new Map(),
    ...overrides,
  };
}

describe('buildStatements coverage', () => {
  it('labels every statement with its source, live value, and evidence anchor', () => {
    const result = buildStatements(inputs());

    expect(result.generatedAt).toBe(NOW.toISOString());
    const byDomain = new Map(result.statements.map((s) => [s.domain, s]));
    expect([...byDomain.keys()].sort()).toEqual(
      ['growth', 'pipeline', 'product', 'reliability', 'spend'].sort(),
    );
    expect([...byDomain.values()].map((s) => s.kicker)).toEqual(
      expect.arrayContaining([
        'Reliability · operations · seen just now',
        'Product · product telemetry · seen just now',
        'Pipeline · podcast-pipeline · seen just now',
        'Spend · cost ledger · seen just now',
        'Growth · social telemetry · seen just now',
      ]),
    );
    expect([...byDomain.values()].map((s) => s.evidenceRef).sort()).toEqual(
      [
        'growth-audience',
        'pipeline-episodes',
        'product-freshness',
        'reliability-signals',
        'spend-providers',
      ].sort(),
    );
    // Every composed rule always reports a value and delta string, so the
    // builder never reaches for its own unavailable placeholder: the one
    // em-dash below comes from the pipeline rule itself, which has no
    // priced episode to average yet.
    const values = new Map(result.statements.map((s) => [s.domain, s.value]));
    expect(values.get('reliability')).toBe('1 critical');
    expect(values.get('product')).toBe('9');
    expect(values.get('pipeline')).toBe('—');
    expect(values.get('spend')).toBe('$60.80');
    expect(values.get('growth')).toBe('1,204');
    const deltas = new Map(result.statements.map((s) => [s.domain, s.delta]));
    expect(deltas.get('reliability')).toBe('7 of 8 healthy');
    expect(deltas.get('pipeline')).toBe('0 in production');
    expect(byDomain.get('reliability')?.url).toBe(
      'https://fly.io/apps/from-fed-to-chain-api',
    );
  });

  it('normalizes every statement tone to good, bad, or neutral', () => {
    const result = buildStatements(inputs());
    const tones = new Map(
      result.statements.map((s) => [s.domain, s.deltaTone]),
    );

    expect(tones.get('reliability')).toBe('bad');
    expect(tones.get('product')).toBe('neutral');
    expect(tones.get('pipeline')).toBe('good');
    expect(tones.get('spend')).toBe('bad');
    expect(tones.get('growth')).toBe('good');
    for (const statement of result.statements) {
      expect(['good', 'bad', 'neutral']).toContain(statement.deltaTone);
    }
  });

  it('carries no reliability URL without a signal to point at', () => {
    const result = buildStatements(
      inputs({
        operations: {
          ...operations(),
          status: 'healthy',
          domains: OPERATIONS_DOMAINS.map((domain) => ({
            domain,
            status: 'healthy' as const,
            signalCount: 0,
          })),
          priorities: [],
          signals: [],
        },
      }),
    );
    const reliability = result.statements.find(
      (s) => s.domain === 'reliability',
    )!;

    expect(reliability.status).toBe('healthy');
    expect(reliability.value).toBe('Healthy');
    expect(reliability.url).toBeNull();
  });
});
