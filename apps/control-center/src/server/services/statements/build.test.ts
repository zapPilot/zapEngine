import type { CostSnapshot } from '@zapengine/cost-observability';
import { describe, expect, it } from 'vitest';

import {
  FLY_RUN_RATE_USAGE_KEY,
  OPERATIONS_DOMAINS,
  type CostHistoryResponse,
  type CostProviderResult,
  type CustomerEconomicsResponse,
  type MonthlyCostPoint,
  type OperationsResponse,
  type OperationsSocialResponse,
  type OverviewResponse,
  type PodcastCostResponse,
  type ProductHealthResponse,
  type ProviderMonthCost,
  type SocialGrowthResponse,
  type SocialPerformanceResponse,
} from '../../../shared/types.js';
import type { PodcastPipelineResponse } from '../../../shared/podcast-pipeline.js';
import type { MetricSeries } from '../metric-snapshots.js';
import { buildStatements } from './build.js';
import type { StatementInputs } from './types.js';

const NOW = new Date('2026-09-17T07:42:00.000Z');

function product(
  overrides: Partial<ProductHealthResponse> = {},
): ProductHealthResponse {
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
    ...overrides,
  };
}

function overview(overrides: Partial<OverviewResponse> = {}): OverviewResponse {
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
    ...overrides,
  };
}

/**
 * The two shapes a Fly row can take: the flyctl estimate, unpriced with its
 * run-rate parked in `usage`, and an operator-recorded billed figure. R2 must
 * refuse to call either one the month's spend driver — the first has no
 * projection to compare at all, and the second is a partial month that would
 * always read as a collapse against a whole prior one.
 */
function flyProvider(snapshot: {
  accruedCostUsd: number | null;
  projectedCostUsd: number | null;
  source: CostSnapshot['source'];
  usage?: CostSnapshot['usage'];
}): CostProviderResult {
  return {
    provider: 'fly',
    label: 'Fly.io',
    status: 'ok',
    costType: 'estimated',
    snapshot: {
      provider: 'fly',
      periodStart: '2026-09-01T00:00:00.000Z',
      periodEnd: NOW.toISOString(),
      accruedCostUsd: snapshot.accruedCostUsd,
      projectedCostUsd: snapshot.projectedCostUsd,
      costType: 'estimated',
      source: snapshot.source,
      usage: snapshot.usage ?? [],
      fetchedAt: NOW.toISOString(),
    },
    message: null,
  };
}

/** The flyctl estimate: nothing priced, the run-rate parked in `usage`. */
const FLY_RUN_RATE_ONLY: CostProviderResult = flyProvider({
  accruedCostUsd: null,
  projectedCostUsd: null,
  source: 'api',
  usage: [
    {
      key: FLY_RUN_RATE_USAGE_KEY,
      label: 'Compute run-rate (list price, whole month)',
      unit: 'usd',
      value: 67.7,
    },
  ],
});

/** An operator-recorded billed figure: month-to-date, not a projection. */
const FLY_MANUAL_FIGURE: CostProviderResult = flyProvider({
  accruedCostUsd: 14.02,
  projectedCostUsd: 14.02,
  source: 'manual',
});

/** August, with Fly's last full month sitting at the flyctl ceiling. */
const PREVIOUS_MONTH_WITH_FLY: ProviderMonthCost[] = [
  { provider: 'openrouter', accruedCostUsd: 11.2 },
  { provider: 'fly', accruedCostUsd: 64.38 },
];

function costHistory(
  overrides: Partial<CostHistoryResponse> = {},
): CostHistoryResponse {
  return {
    currentMonthDaily: [],
    monthlyTotals: [{ month: '2026-08', accruedCostUsd: 51.4 }],
    cashSpendUsd: 225,
    previousMonthByProvider: [{ provider: 'openrouter', accruedCostUsd: 11.2 }],
    ...overrides,
  };
}

function socialPerformance(
  overrides: Partial<SocialPerformanceResponse> = {},
): SocialPerformanceResponse {
  return {
    generatedAt: NOW.toISOString(),
    status: 'ok',
    window: 'latest',
    message: null,
    accounts: [],
    decisions: [
      {
        platform: 'rednote',
        confidence: 'medium',
        evidenceSamples: 18,
        preferredHookTypes: ['contrarian'],
        avoidHashtags: [],
        preferredHashtags: [],
        bestTopic: 'regime shifts',
        bestTopicSamples: 6,
        platformMedian24hViews: 205,
        bestTopicMedian24hViews: 410,
        bestTopicLiftVsPlatformMedian: 2,
        publishSlotsJst: 'Thursday 20:00 JST',
        topExample: null,
      },
    ],
    episodes: [],
    ...overrides,
  };
}

function socialGrowth(
  overrides: Partial<SocialGrowthResponse> = {},
): SocialGrowthResponse {
  return {
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
    attribution: [],
    ...overrides,
  };
}

function customers(
  overrides: Partial<CustomerEconomicsResponse> = {},
): CustomerEconomicsResponse {
  return {
    generatedAt: NOW.toISOString(),
    status: 'ok',
    message: null,
    summary: {
      totalCustomers: 87,
      priorityUsers: 5,
      standardUsers: 80,
      pausedUsers: 2,
      activeLast7d: 12,
      inactiveButPriority: 2,
      aumUsd: 179_612.34,
      attributedCostUsd30d: 4.2,
      revenueUsd: null,
    },
    users: [],
    ...overrides,
  };
}

function operationsSocial(
  overrides: Partial<OperationsSocialResponse> = {},
): OperationsSocialResponse {
  return {
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
    waitingMediaLanes: 0,
    invalidJobRows: 0,
    message: null,
    ...overrides,
  };
}

function podcastPipeline(
  overrides: Partial<PodcastPipelineResponse> = {},
): PodcastPipelineResponse {
  return {
    generatedAt: NOW.toISOString(),
    status: 'ok',
    message: null,
    episodes: [],
    ...overrides,
  };
}

function podcastCosts(
  overrides: Partial<PodcastCostResponse> = {},
): PodcastCostResponse {
  return {
    episodes: [],
    generatedAt: NOW.toISOString(),
    status: 'ok',
    message: null,
    ...overrides,
  };
}

function operations(
  overrides: Partial<OperationsResponse> = {},
): OperationsResponse {
  const domains = OPERATIONS_DOMAINS.map((domain, index) => ({
    domain,
    status: index === 0 ? ('critical' as const) : ('healthy' as const),
    signalCount: 1,
  }));
  const signal = {
    fingerprint: 'fly:process-group/from-fed-to-chain-api/app',
    source: 'fly' as const,
    domain: 'infra' as const,
    status: 'critical' as const,
    title: 'from-fed-to-chain-api app has no started Machine',
    detail: null,
    evidence: {
      startedMachines: 0,
      stoppedMachines: 1,
      criticalSinceMinutes: 134,
    },
    observedAt: NOW.toISOString(),
    url: 'https://fly.io/apps/from-fed-to-chain-api',
  };
  return {
    generatedAt: NOW.toISOString(),
    status: 'critical',
    domains,
    priorities: [{ signal, score: 78, reasons: ['critical infra signal'] }],
    signals: [signal],
    ...overrides,
  };
}

function series(values: number[]): MetricSeries {
  const delta7d =
    values.length >= 8
      ? (values[values.length - 1] ?? 0) - (values[values.length - 8] ?? 0)
      : null;
  return {
    series: values,
    latest: values[values.length - 1] ?? null,
    delta7d,
    rowCount: values.length,
  };
}

function inputs(overrides: Partial<StatementInputs> = {}): StatementInputs {
  return {
    now: NOW,
    operations: operations(),
    overview: overview(),
    costHistory: costHistory(),
    product: product(),
    socialGrowth: socialGrowth(),
    socialPerformance: socialPerformance(),
    customers: customers(),
    operationsSocial: operationsSocial(),
    podcastPipeline: podcastPipeline(),
    podcastCosts: podcastCosts(),
    metricSeries: new Map(),
    ...overrides,
  };
}

/** R2's sentence, flattened the way a reader sees it. */
/**
 * R2 with one extra provider on top of the default roster. Every case below
 * turns on the same three levers — what the month projects to, which provider
 * joins it, and what the prior month is measured against — so stating them as
 * arguments keeps each test about the accounting question it asks.
 */
function spendOver(input: {
  extraProvider: CostProviderResult;
  projectedCostUsd: number;
  monthlyTotals?: MonthlyCostPoint[];
  previousMonthByProvider?: ProviderMonthCost[];
}): ReturnType<typeof buildStatements> {
  return buildStatements(
    inputs({
      overview: overview({
        projectedCostUsd: input.projectedCostUsd,
        providers: [...overview().providers, input.extraProvider],
      }),
      costHistory: costHistory({
        ...(input.monthlyTotals ? { monthlyTotals: input.monthlyTotals } : {}),
        previousMonthByProvider:
          input.previousMonthByProvider ?? PREVIOUS_MONTH_WITH_FLY,
      }),
    }),
  );
}

function spendSentence(result: ReturnType<typeof buildStatements>): string {
  const spend = result.statements.find(
    (statement) => statement.domain === 'spend',
  )!;
  return spend.sentence
    .map((segment) => ('text' in segment ? segment.text : segment.value))
    .join('');
}

describe('buildStatements', () => {
  it('produces exactly five statements, one per narrative domain, sorted by score', () => {
    const result = buildStatements(inputs());
    expect(result.statements).toHaveLength(5);
    expect(new Set(result.statements.map((s) => s.domain))).toEqual(
      new Set(['reliability', 'product', 'pipeline', 'spend', 'growth']),
    );
    const scores = result.statements.map((s) => s.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('produces a StatementHeader for every domain, exhaustively', () => {
    const result = buildStatements(inputs());
    expect(result.headers.map((h) => h.domain).sort()).toEqual(
      ['growth', 'pipeline', 'product', 'reliability', 'spend'].sort(),
    );
  });

  it('R1: names the top critical signal and its live elapsed time, never a fabricated one', () => {
    const result = buildStatements(inputs());
    const reliability = result.statements.find(
      (s) => s.domain === 'reliability',
    )!;
    expect(reliability.status).toBe('critical');
    const sentence = reliability.sentence
      .map((s) => ('text' in s ? s.text : s.value))
      .join('');
    expect(sentence).toContain(
      'from-fed-to-chain-api app has no started Machine',
    );
    expect(sentence).toContain('2h 14m');
  });

  it('R1: omits the elapsed clause when the signal carries no honest duration', () => {
    const result = buildStatements(
      inputs({
        operations: operations({
          priorities: [
            {
              signal: {
                fingerprint: 'sentry:issue/boom',
                source: 'sentry',
                domain: 'errors',
                status: 'critical',
                title: 'Unhandled error spike',
                detail: null,
                evidence: {},
                observedAt: NOW.toISOString(),
                url: null,
              },
              score: 90,
              reasons: [],
            },
          ],
          signals: [
            {
              fingerprint: 'sentry:issue/boom',
              source: 'sentry',
              domain: 'errors',
              status: 'critical',
              title: 'Unhandled error spike',
              detail: null,
              evidence: {},
              observedAt: NOW.toISOString(),
              url: null,
            },
          ],
        }),
      }),
    );
    const reliability = result.statements.find(
      (s) => s.domain === 'reliability',
    )!;
    const sentence = reliability.sentence
      .map((s) => ('text' in s ? s.text : s.value))
      .join('');
    expect(sentence).toBe('1 critical: Unhandled error spike.');
  });

  it('R1: keeps unconfigured domains explicitly separate from failures', () => {
    const signal = {
      fingerprint: 'github-actions:track-record-snapshot/streak',
      source: 'github-actions' as const,
      domain: 'jobs' as const,
      status: 'critical' as const,
      title: 'track-record-snapshot failed 5 runs in a row',
      detail: null,
      evidence: { failureStreak: 5 },
      observedAt: NOW.toISOString(),
      url: null,
    };
    const unknown = new Set(['analytics', 'errors', 'infra']);
    const domains = OPERATIONS_DOMAINS.map((domain) => ({
      domain,
      status: unknown.has(domain)
        ? ('unknown' as const)
        : domain === 'jobs'
          ? ('critical' as const)
          : ('healthy' as const),
      signalCount: 1,
    }));
    const result = buildStatements(
      inputs({
        operations: operations({
          domains,
          priorities: [{ signal, score: 86, reasons: [] }],
          signals: [signal],
        }),
      }),
    );
    const reliability = result.statements.find(
      (statement) => statement.domain === 'reliability',
    )!;
    const sentence = reliability.sentence
      .map((segment) => ('text' in segment ? segment.text : segment.value))
      .join('');

    expect(sentence).toBe(
      '1 critical: track-record-snapshot failed 5 runs in a row. 3 unconfigured, not failing.',
    );
  });

  it('R2: names the driver provider and paces to the projected total', () => {
    const result = buildStatements(inputs());
    const spend = result.statements.find((s) => s.domain === 'spend')!;
    const sentence = spend.sentence
      .map((s) => ('text' in s ? s.text : s.value))
      .join('');
    expect(sentence).toContain('$60.80');
    expect(sentence).toContain('OpenRouter is the driver');
  });

  it('R2: never names a run-rate-only Fly row as the driver', () => {
    const result = spendOver({
      extraProvider: FLY_RUN_RATE_ONLY,
      projectedCostUsd: 17.4,
    });

    const sentence = spendSentence(result);
    expect(sentence).toContain('$17.40');
    expect(sentence).toContain('OpenRouter is the driver');
    expect(sentence).not.toContain('Fly.io');
  });

  it('R2: never names an operator-recorded Fly figure as the driver', () => {
    const result = spendOver({
      extraProvider: FLY_MANUAL_FIGURE,
      projectedCostUsd: 31.42,
    });

    // Fly's -$50.36 is a month-to-date figure minus a whole prior month, not
    // a fall in spend, so OpenRouter's +$6.20 is the only honest driver.
    const sentence = spendSentence(result);
    expect(sentence).toContain('OpenRouter is the driver');
    expect(sentence).not.toContain('Fly.io is the driver');
  });

  it('R2: reads a provider going unpriced as an omission, never as a fall', () => {
    const result = spendOver({
      extraProvider: FLY_RUN_RATE_ONLY,
      monthlyTotals: [{ month: '2026-08', accruedCostUsd: 75.58 }],
      projectedCostUsd: 17.4,
    });

    // August's $75.58 is OpenRouter's $11.20 plus Fly's $64.38; September's
    // $17.40 is OpenRouter alone. Against the whole ledger that is -77%, a
    // saving nobody made — the honest baseline is the $11.20 belonging to the
    // one provider still reporting, and against that spend rose.
    const spend = result.statements.find((s) => s.domain === 'spend')!;
    const sentence = spendSentence(result);
    expect(sentence).toContain('+55% vs August');
    expect(sentence).not.toContain('-77%');
    expect(spend.delta).toBe('+55% · MoM');
    expect(spend.deltaTone).toBe('bad');
    expect(spend.status).toBe('degraded');
  });

  it('R2: states no month-over-month figure when a priced provider has no prior month', () => {
    const result = spendOver({
      extraProvider: FLY_MANUAL_FIGURE,
      monthlyTotals: [{ month: '2026-08', accruedCostUsd: 11.2 }],
      previousMonthByProvider: [
        { provider: 'openrouter', accruedCostUsd: 11.2 },
      ],
      projectedCostUsd: 31.42,
    });

    // August's ledger total exists but covers OpenRouter alone, while
    // September's $31.42 also carries Fly's operator-recorded figure. No
    // baseline covers the same providers, so the rule owes the reader silence
    // rather than a percentage measured across two different sets.
    const spend = result.statements.find((s) => s.domain === 'spend')!;
    const sentence = spendSentence(result);
    expect(sentence).toContain('September is pacing to $31.42.');
    expect(sentence).not.toContain('vs August');
    expect(spend.deltaTone).toBe('neutral');
  });

  it('R6: reports the north star value with a "collecting" delta before history exists', () => {
    const result = buildStatements(inputs());
    const productStatement = result.statements.find(
      (s) => s.domain === 'product',
    )!;
    expect(productStatement.value).toBe('9');
    expect(productStatement.delta).toContain('collecting');
  });

  it('R6: reads a real Δ7d and series once ops.metric_snapshots has history', () => {
    const result = buildStatements(
      inputs({
        metricSeries: new Map([
          ['active_portfolios_7d', series([6, 7, 7, 8, 8, 9, 9, 9])],
        ]),
      }),
    );
    const productStatement = result.statements.find(
      (s) => s.domain === 'product',
    )!;
    expect(productStatement.series).toEqual([6, 7, 7, 8, 8, 9, 9, 9]);
    expect(productStatement.delta).toBe('+3 · 7d');
    expect(productStatement.deltaTone).toBe('good');
  });

  it('R8: flags priority accounts inactive 30+ days on the Product StatementHeader', () => {
    const result = buildStatements(
      inputs({
        customers: customers({
          summary: {
            totalCustomers: 87,
            priorityUsers: 5,
            standardUsers: 80,
            pausedUsers: 2,
            activeLast7d: 12,
            inactiveButPriority: 1,
            aumUsd: 179_612.34,
            attributedCostUsd30d: 4.2,
            revenueUsd: null,
          },
          users: [
            {
              userId: 'u1',
              email: 'idle@example.com',
              planCode: 'vip',
              defaultTier: 'priority',
              overrideTier: null,
              overrideReason: null,
              overrideExpiresAt: null,
              effectiveTier: 'priority',
              refreshIntervalHours: 24,
              lastActivityAt: '2026-08-01T00:00:00.000Z',
              inactiveDays: 47,
              aumUsd: 1_680,
              wallets: [],
              portfolioStaleHours: 6,
              portfolioWorstStaleHours: 6,
              neverRefreshedWallets: 0,
              dueForRefresh: false,
              requestCount30d: 0,
              attributedCostUsd30d: 1.68,
              costBasis: 'allocated_estimate',
              revenueUsd: null,
            },
          ],
        }),
      }),
    );
    const header = result.headers.find((h) => h.domain === 'product')!;
    const facts = header.facts.map((f) => `${f.value} ${f.note}`).join(' | ');
    expect(facts).toContain('1 priority account inactive 30d+');
  });
});
