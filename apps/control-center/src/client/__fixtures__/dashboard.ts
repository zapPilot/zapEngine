import type { CostSnapshot } from '@zapengine/cost-observability';

import { FLY_RUN_RATE_ONLY_MESSAGE } from '../../server/services/cost-history-aggregate.js';
import type {
  Statement,
  StatementHeaderData,
  StatementsResponse,
} from '../../shared/statements.js';
import {
  type CostHistoryPoint,
  type CostHistoryProviderPoint,
  type CostHistoryResponse,
  type CostProviderResult,
  FLY_RUN_RATE_USAGE_KEY,
  type OperationalPriority,
  type OperationalSignal,
  type OperationalStatus,
  OPERATIONS_DOMAINS,
  type OperationsResponse,
  type OverviewResponse,
  type ProductHealthResponse,
  type SocialPerformanceResponse,
} from '../../shared/types.js';

export const GENERATED_AT = '2026-08-28T12:00:00.000Z';

export function signalFixture(
  overrides: Partial<OperationalSignal> = {},
): OperationalSignal {
  return {
    fingerprint: 'fly:machine/app',
    source: 'fly',
    domain: 'infra',
    status: 'critical',
    title: 'Machine stopped',
    detail: 'zap-account-engine has no running machine',
    evidence: { machines: 0 },
    observedAt: GENERATED_AT,
    url: null,
    ...overrides,
  };
}

export function priorityFixture(
  overrides: Partial<OperationalPriority> = {},
): OperationalPriority {
  return {
    signal: signalFixture(),
    score: 78,
    reasons: ['critical infra signal'],
    ...overrides,
  };
}

export function operationsFixture(
  overrides: Partial<OperationsResponse> = {},
): OperationsResponse {
  const priorities = overrides.priorities ?? [priorityFixture()];
  return {
    generatedAt: GENERATED_AT,
    status: 'critical',
    domains: OPERATIONS_DOMAINS.map((domain, index) => ({
      domain,
      status: (index === 0 ? 'critical' : 'healthy') as OperationalStatus,
      signalCount: 1,
    })),
    signals: priorities.map((priority) => priority.signal),
    ...overrides,
    priorities,
  };
}

export function productFixture(
  overrides: Partial<ProductHealthResponse> = {},
): ProductHealthResponse {
  return {
    registeredUsers: 87,
    verifiedWallets: 54,
    portfolioUsers: 41,
    wau: 12,
    mau: 31,
    observedPortfolioUsd: 179_612.34,
    portfolioFresh24h: 20,
    portfolioFresh7d: 33,
    top1PortfolioShare: 0.42,
    top3PortfolioShare: 0.71,
    activePortfolios7d: 9,
    ...overrides,
  };
}

export function socialFixture(
  overrides: Partial<SocialPerformanceResponse> = {},
): SocialPerformanceResponse {
  return {
    status: 'ok',
    message: null,
    window: 'latest',
    generatedAt: GENERATED_AT,
    accounts: [
      { platform: 'x', followers: 240, capturedAt: GENERATED_AT },
      { platform: 'rednote', followers: 964, capturedAt: GENERATED_AT },
    ],
    decisions: [
      {
        platform: 'rednote',
        evidenceSamples: 18,
        confidence: 'medium',
        preferredHookTypes: ['contrarian'],
        preferredHashtags: ['#理財'],
        avoidHashtags: [],
        bestTopic: 'regime shifts',
        bestTopicSamples: 6,
        bestTopicMedian24hViews: 410,
        platformMedian24hViews: 205,
        bestTopicLiftVsPlatformMedian: 2,
        publishSlotsJst: '20:00',
        topExample: 'Why the 200MA still matters',
      },
    ],
    episodes: [
      {
        episodeId: 'ep-1',
        title: 'Buy in fear',
        totalViews: 1_204,
        totalImpressions: 9_100,
        platforms: [],
      },
    ],
    ...overrides,
  };
}

export function statementFixture(
  overrides: Partial<Statement> = {},
): Statement {
  return {
    domain: 'reliability',
    status: 'critical',
    score: 178,
    sentence: [
      { text: '1 critical: ' },
      { value: 'account-engine has no started Machine', tone: 'error' },
      { text: ' (2h 14m).' },
    ],
    kicker: 'Reliability · operations · seen 2 min ago',
    series: [6, 7, 7, 8, 8, 7, 6, 5],
    value: '1 critical',
    delta: '3 of 8 healthy',
    deltaTone: 'bad',
    evidenceRef: 'reliability-signals',
    url: null,
    ...overrides,
  };
}

export function statementHeaderFixture(
  overrides: Partial<StatementHeaderData> = {},
): StatementHeaderData {
  return {
    domain: 'reliability',
    status: 'critical',
    sentence: statementFixture().sentence,
    facts: [
      {
        kicker: 'Because · domains',
        value: '1 critical',
        note: '3 of 8 domains healthy',
      },
    ],
    ...overrides,
  };
}

export function statementsResponseFixture(
  overrides: Partial<StatementsResponse> = {},
): StatementsResponse {
  return {
    generatedAt: GENERATED_AT,
    statements: [statementFixture()],
    headers: [statementHeaderFixture()],
    ...overrides,
  };
}

/**
 * The four-provider split a real day carries: one metered API cost, one fixed
 * commitment, one prepaid balance valued at list price, and Fly reporting a
 * run-rate but no amount we expect to pay. That last row is the shape every
 * cost surface has to render honestly, so it belongs in the default fixture
 * rather than in whichever test remembers to add it.
 */
function dailyProviders(
  openrouterUsd: number,
  debankUsd: number,
): CostHistoryProviderPoint[] {
  return [
    {
      provider: 'supabase',
      label: 'Supabase',
      accruedCostUsd: 25,
      costType: 'fixed',
      source: 'fixed',
      periodEnd: GENERATED_AT,
    },
    {
      provider: 'openrouter',
      label: 'OpenRouter',
      accruedCostUsd: openrouterUsd,
      costType: 'actual',
      source: 'api',
      periodEnd: GENERATED_AT,
    },
    {
      provider: 'debank',
      label: 'DeBank',
      accruedCostUsd: debankUsd,
      costType: 'list-price-equivalent',
      source: 'api',
      periodEnd: GENERATED_AT,
    },
    {
      provider: 'fly',
      label: 'Fly.io',
      accruedCostUsd: null,
      costType: 'estimated',
      source: 'api',
      periodEnd: GENERATED_AT,
    },
  ];
}

/**
 * A day whose Fly row is an operator-recorded figure instead of a run-rate,
 * carrying the moment that figure was read. Only a manual row is dated in the
 * UI, so two of these with different `readAt` values are what tell a day
 * stamped with its own reading from one stamped with the newest.
 */
export function manualFlyDayFixture(input: {
  date: string;
  readAt: string;
}): CostHistoryPoint {
  const providers = dailyProviders(6.12, 3.55).map((entry) =>
    entry.provider === 'fly'
      ? {
          ...entry,
          accruedCostUsd: 14.02,
          source: 'manual' as const,
          periodEnd: input.readAt,
        }
      : entry,
  );
  return { date: input.date, accruedCostUsd: 48.69, providers };
}

export function costHistoryPointFixture(
  overrides: Partial<CostHistoryPoint> = {},
): CostHistoryPoint {
  return {
    date: '2026-08-28',
    accruedCostUsd: 34.67,
    providers: dailyProviders(6.12, 3.55),
    ...overrides,
  };
}

export function costHistoryFixture(
  overrides: Partial<CostHistoryResponse> = {},
): CostHistoryResponse {
  return {
    currentMonthDaily: [
      costHistoryPointFixture({
        date: '2026-08-26',
        accruedCostUsd: 32.1,
        providers: dailyProviders(4.1, 3),
      }),
      costHistoryPointFixture({
        date: '2026-08-27',
        accruedCostUsd: 33.4,
        providers: dailyProviders(5.15, 3.25),
      }),
      costHistoryPointFixture(),
    ],
    monthlyTotals: [{ month: '2026-07', accruedCostUsd: 38.4 }],
    cashSpendUsd: 200,
    previousMonthByProvider: [
      { provider: 'supabase', accruedCostUsd: 25 },
      { provider: 'openrouter', accruedCostUsd: 9.4 },
    ],
    ...overrides,
  };
}

export function costSnapshotFixture(
  overrides: Partial<CostSnapshot> = {},
): CostSnapshot {
  return {
    provider: 'openrouter',
    periodStart: '2026-08-01T00:00:00.000Z',
    periodEnd: GENERATED_AT,
    usage: [{ key: 'monthly', label: 'This month', unit: 'usd', value: 6.12 }],
    accruedCostUsd: 6.12,
    projectedCostUsd: 6.8,
    costType: 'actual',
    source: 'api',
    fetchedAt: GENERATED_AT,
    ...overrides,
  };
}

export function costProviderFixture(
  overrides: Partial<CostProviderResult> = {},
): CostProviderResult {
  return {
    provider: 'openrouter',
    label: 'OpenRouter',
    status: 'ok',
    costType: 'actual',
    snapshot: costSnapshotFixture(),
    message: null,
    ...overrides,
  };
}

/**
 * The scaffold both Fly rows stand on. They are the same provider at the same
 * cost type, so anything that differs between them here would read as a
 * difference the UI is allowed to key off — and the only difference the UI may
 * key off is the snapshot's `source`.
 */
function flyProviderFixture(
  snapshot: Partial<CostSnapshot>,
  overrides: Partial<CostProviderResult>,
): CostProviderResult {
  return costProviderFixture({
    provider: 'fly',
    label: 'Fly.io',
    costType: 'estimated',
    snapshot: costSnapshotFixture({
      provider: 'fly',
      costType: 'estimated',
      ...snapshot,
    }),
    ...overrides,
  });
}

/**
 * Fly as the flyctl collector leaves it: a compute run-rate in `usage` and no
 * priced figure at all, which is what keeps a saturation ceiling out of the
 * headline totals.
 */
export function flyRunRateProviderFixture(
  overrides: Partial<CostProviderResult> = {},
): CostProviderResult {
  return flyProviderFixture(
    {
      usage: [
        {
          key: FLY_RUN_RATE_USAGE_KEY,
          label: 'Compute run-rate (full month at list price)',
          unit: 'usd',
          value: 67.7,
        },
      ],
      accruedCostUsd: null,
      projectedCostUsd: null,
    },
    {
      // The constant the collector actually emits, not a copy of it: a
      // disclosure test that asserted a message the app never produces would
      // pass while the dashboard said something else.
      message: FLY_RUN_RATE_ONLY_MESSAGE,
      ...overrides,
    },
  );
}

/**
 * Fly once an operator has read the real invoice off the dashboard: the same
 * cost type as the run-rate row, told apart only by `source`.
 */
export function manualFlyProviderFixture(
  overrides: Partial<CostProviderResult> = {},
): CostProviderResult {
  return flyProviderFixture(
    {
      periodEnd: '2026-08-28T09:00:00.000Z',
      usage: [],
      accruedCostUsd: 14.02,
      projectedCostUsd: 15.5,
      source: 'manual',
    },
    overrides,
  );
}

/**
 * Fly in the default configuration: `FLY_COST_MODE` is `manual`, so nothing has
 * run the collector and nobody has recorded a figure. The roster still carries
 * the provider — with no snapshot at all — and that is the row the headline
 * totals have to announce rather than quietly skip. A figure recorded before a
 * month rollover reaches the client in this same shape, told apart only by its
 * message.
 */
export function unrecordedFlyProviderFixture(
  overrides: Partial<CostProviderResult> = {},
): CostProviderResult {
  return costProviderFixture({
    provider: 'fly',
    label: 'Fly.io',
    status: 'unconfigured',
    costType: 'estimated',
    snapshot: null,
    message: 'Needs current estimate',
    ...overrides,
  });
}

/** The three providers that report an amount we expect to pay. */
export function pricedCostProvidersFixture(): CostProviderResult[] {
  return [
    costProviderFixture({
      provider: 'supabase',
      label: 'Supabase',
      costType: 'fixed',
      snapshot: costSnapshotFixture({
        provider: 'supabase',
        usage: [
          {
            key: 'monthly_plan',
            label: 'Monthly plan',
            unit: 'usd',
            value: 25,
          },
        ],
        accruedCostUsd: 25,
        projectedCostUsd: 25,
        costType: 'fixed',
        source: 'fixed',
      }),
    }),
    costProviderFixture(),
    costProviderFixture({
      provider: 'debank',
      label: 'DeBank',
      costType: 'list-price-equivalent',
      snapshot: costSnapshotFixture({
        provider: 'debank',
        usage: [
          {
            key: 'monthly_units',
            label: 'Units this month',
            unit: 'units',
            value: 2_220,
          },
        ],
        accruedCostUsd: 3.55,
        projectedCostUsd: 3.9,
        costType: 'list-price-equivalent',
      }),
    }),
  ];
}

/** The roster the cost sync returns today: three priced rows, Fly unpriced. */
export function costProvidersFixture(): CostProviderResult[] {
  return [...pricedCostProvidersFixture(), flyRunRateProviderFixture()];
}

export function overviewFixture(
  overrides: Partial<OverviewResponse> = {},
): OverviewResponse {
  return {
    generatedAt: GENERATED_AT,
    accruedCostUsd: 26.96,
    projectedCostUsd: 41.3,
    cashInvoiceSpendUsd: 200,
    aumUsd: 179_612.34,
    activeAccounts: 12,
    socialReach: 1_204,
    product: productFixture(),
    providers: [],
    social: socialFixture(),
    ...overrides,
  };
}
