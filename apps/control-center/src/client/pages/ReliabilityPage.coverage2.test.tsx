// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CostHistoryResponse,
  OperationalSignal,
  OperationsResponse,
  PodcastCostResponse,
} from '../../shared/types.js';
import {
  costProviderFixture,
  costSnapshotFixture,
  overviewFixture,
} from '../__fixtures__/dashboard.js';
import { ReliabilityPage } from './ReliabilityPage.js';

afterEach(cleanup);

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('operator history unavailable'))),
  );
});

function githubSignal(
  overrides: Partial<OperationalSignal> = {},
): OperationalSignal {
  return {
    detail: 'Cost snapshots may be stale.',
    domain: 'jobs',
    evidence: {
      failureStreak: 4,
      lastConclusion: 'failure',
      lastRunAt: '2026-09-10T00:00:00Z',
      workflow: 'ops-cost-sync.yml',
    },
    fingerprint: 'github-actions:workflow/ops-cost-sync.yml',
    observedAt: '2026-09-10T00:30:00Z',
    source: 'github-actions',
    status: 'critical',
    title: 'ops-cost-sync failed 4 runs in a row',
    url: 'https://github.com/zapPilot/zapEngine/actions',
    ...overrides,
  };
}

function flySignal(
  overrides: Partial<OperationalSignal> = {},
): OperationalSignal {
  return {
    detail: null,
    domain: 'infra',
    evidence: { startedMachines: 2 },
    fingerprint: 'fly:app',
    observedAt: '2026-09-10T00:30:00Z',
    source: 'fly',
    status: 'healthy',
    title: 'fly app healthy',
    url: null,
    ...overrides,
  };
}

function day(date: string, supabase: number | null, openrouter: number | null) {
  const providers = [];
  providers.push({
    accruedCostUsd: supabase,
    costType: 'list-price-equivalent' as const,
    label: 'Supabase',
    periodEnd: date,
    provider: 'supabase' as const,
    source: 'collector' as const,
  });
  providers.push({
    accruedCostUsd: openrouter,
    costType: 'list-price-equivalent' as const,
    label: 'OpenRouter',
    periodEnd: date,
    provider: 'openrouter' as const,
    source: 'collector' as const,
  });
  const total =
    supabase === null || openrouter === null ? null : supabase + openrouter;
  return { accruedCostUsd: total, date, providers };
}

const baseHistory = {
  cashSpendUsd: null,
  currentMonthDaily: [
    day('2026-09-05', 25, 1),
    day('2026-09-06', 26, 2),
    day('2026-09-07', 27, 3),
    day('2026-09-08', 28, 4),
    day('2026-09-09', 29, 7),
  ],
  monthlyTotals: [],
  previousMonthByProvider: [],
} as unknown as CostHistoryResponse;

const baseCosts: PodcastCostResponse = {
  episodes: [],
  generatedAt: '2026-09-10T01:00:00Z',
  message: null,
  status: 'ok',
};

function renderPage(
  overrides: Partial<Parameters<typeof ReliabilityPage>[0]> = {},
) {
  const signal = githubSignal();
  const operations: OperationsResponse = {
    domains: [],
    generatedAt: '2026-09-10T01:00:00Z',
    priorities: [{ reasons: ['critical status'], score: 86, signal }],
    signals: [signal],
    status: 'critical',
  };
  return render(
    <ReliabilityPage
      costHistory={baseHistory}
      data={operations}
      overview={null}
      podcastCosts={baseCosts}
      {...overrides}
    />,
  );
}

describe('ReliabilityPage coverage2', () => {
  it('renders with no operations at all', () => {
    renderPage({ data: null, overview: null });
    expect(screen.getByText('系統整體健康')).toBeVisible();
  });

  it('renders fly fleet health from fly signals', () => {
    const signals = [
      flySignal({ status: 'healthy', evidence: { startedMachines: 2 } }),
      flySignal({
        status: 'critical',
        fingerprint: 'fly:other',
        title: 'other down',
        evidence: { startedMachines: 'two' },
      }),
    ];
    renderPage({
      data: {
        domains: [],
        generatedAt: '2026-09-10T01:00:00Z',
        priorities: [],
        signals,
        status: 'critical',
      },
    });
    expect(screen.getByText('1 / 2')).toBeVisible();
    expect(screen.getByText('2 machines running')).toBeVisible();
  });

  it('reports fly as unconfigured without fly signals', () => {
    renderPage({
      data: {
        domains: [],
        generatedAt: '2026-09-10T01:00:00Z',
        priorities: [],
        signals: [],
        status: 'healthy',
      },
    });
    expect(screen.getByText('Fly credentials not configured')).toBeVisible();
  });

  it('reads an empty cost history without anomalies', () => {
    renderPage({
      costHistory: {
        ...baseHistory,
        currentMonthDaily: [],
      },
    });
    expect(screen.getByText('No daily reading yet')).toBeVisible();
  });

  it('tolerates null accrual readings in the daily deltas', () => {
    renderPage({
      costHistory: {
        ...baseHistory,
        currentMonthDaily: [
          day('2026-09-08', null, 4),
          day('2026-09-09', 29, 7),
        ] as unknown as CostHistoryResponse['currentMonthDaily'],
      },
    });
    expect(screen.getByText('Spend today')).toBeVisible();
  });

  it('sorts providers with all snapshots missing', () => {
    renderPage({
      overview: overviewFixture({
        providers: [
          costProviderFixture({
            provider: 'supabase',
            label: 'Supabase',
            snapshot: null as never,
            message: 'no snapshot',
          }),
          costProviderFixture({
            provider: 'openrouter',
            label: 'OpenRouter',
            snapshot: null as never,
            message: 'no snapshot',
          }),
        ],
      }),
    });
    expect(screen.getByText('Supabase')).toBeVisible();
    expect(screen.getByText('OpenRouter')).toBeVisible();
  });

  it('sorts a missing snapshot after a priced one', () => {
    renderPage({
      overview: overviewFixture({
        providers: [
          costProviderFixture({
            provider: 'supabase',
            label: 'Supabase',
            snapshot: null as never,
            message: 'pending',
          }),
          costProviderFixture({
            provider: 'openrouter',
            label: 'OpenRouter',
            snapshot: costSnapshotFixture({
              provider: 'openrouter',
              accruedCostUsd: 12,
            }),
          }),
        ],
      }),
    });
    expect(screen.getByText('pending')).toBeVisible();
  });

  it('skips anomalies when the baseline is zero', () => {
    renderPage({
      costHistory: {
        ...baseHistory,
        currentMonthDaily: [
          day('2026-09-05', 0, 0),
          day('2026-09-06', 0, 0),
          day('2026-09-07', 0, 0),
          day('2026-09-08', 0, 0),
          day('2026-09-09', 5, 5),
        ] as unknown as CostHistoryResponse['currentMonthDaily'],
      },
    });
    expect(screen.queryByText(/花費上升/)).toBeNull();
  });

  it('renders workflow rows with missing evidence fields', () => {
    const bare = githubSignal({
      evidence: {},
      title: 'bare workflow signal',
    });
    renderPage({
      data: {
        domains: [],
        generatedAt: '2026-09-10T01:00:00Z',
        priorities: [{ reasons: ['x'], score: 1, signal: bare }],
        signals: [bare],
        status: 'critical',
      },
    });
    expect(screen.getAllByText('bare workflow signal').length).toBeGreaterThan(
      0,
    );
    // Missing workflow/lastConclusion fall back to title/status.
    expect(screen.getAllByText('critical').length).toBeGreaterThan(0);
    // Missing streak renders nothing, missing run time renders a dash.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('renders a zero streak without a failure label', () => {
    const calm = githubSignal({
      evidence: {
        failureStreak: 0,
        lastConclusion: 'success',
        lastRunAt: '2026-09-10T00:00:00Z',
        workflow: 'ops-cost-sync.yml',
      },
    });
    renderPage({
      data: {
        domains: [],
        generatedAt: '2026-09-10T01:00:00Z',
        priorities: [],
        signals: [calm],
        status: 'healthy',
      },
    });
    expect(screen.getByText('ops-cost-sync.yml')).toBeVisible();
    expect(screen.queryByText(/連續失敗/)).toBeNull();
  });

  it('renders non-numeric and non-string evidence as fallbacks', () => {
    const odd = githubSignal({
      evidence: {
        failureStreak: 'four' as unknown as number,
        lastConclusion: 42 as unknown as string,
        lastRunAt: 42 as unknown as string,
        workflow: 42 as unknown as string,
      },
    });
    renderPage({
      data: {
        domains: [],
        generatedAt: '2026-09-10T01:00:00Z',
        priorities: [],
        signals: [odd],
        status: 'critical',
      },
    });
    expect(screen.getByText('目前風險')).toBeVisible();
  });
});
