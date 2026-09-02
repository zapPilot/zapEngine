import type {
  Statement,
  StatementHeaderData,
  StatementsResponse,
} from '../../shared/statements.js';
import {
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
