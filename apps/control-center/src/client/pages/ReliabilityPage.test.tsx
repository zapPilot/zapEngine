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
import { ReliabilityPage } from './ReliabilityPage.js';

afterEach(cleanup);

beforeEach(() => {
  // OperatorAudit fetches its own history; this page's assertions do not
  // depend on it, but an unhandled rejection would fail the run.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('operator history unavailable'))),
  );
});

const signal: OperationalSignal = {
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
};

const operations: OperationsResponse = {
  domains: [],
  generatedAt: '2026-09-10T01:00:00Z',
  priorities: [{ reasons: ['critical status'], score: 86, signal }],
  signals: [signal],
  status: 'critical',
};

const podcastCosts: PodcastCostResponse = {
  episodes: [
    {
      breakdown: [],
      episodeId: 'episode-1',
      failedRuns: 1,
      lastRunAt: '2026-09-10T00:30:00Z',
      podcastCostUsd: 7,
      retryWasteUsd: 1,
      runCount: 2,
      title: 'The latest release',
      totalCostUsd: 10,
      unpricedStages: 0,
      videoCostUsd: 3,
    },
  ],
  generatedAt: '2026-09-10T01:00:00Z',
  message: null,
  status: 'ok',
};

function day(date: string, supabase: number, openrouter: number) {
  return {
    accruedCostUsd: supabase + openrouter,
    date,
    providers: [
      {
        accruedCostUsd: supabase,
        costType: 'list-price-equivalent' as const,
        label: 'Supabase',
        periodEnd: date,
        provider: 'supabase' as const,
        source: 'collector' as const,
      },
      {
        accruedCostUsd: openrouter,
        costType: 'list-price-equivalent' as const,
        label: 'OpenRouter',
        periodEnd: date,
        provider: 'openrouter' as const,
        source: 'collector' as const,
      },
    ],
  };
}

const costHistory = {
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

function renderPage(
  overrides: Partial<Parameters<typeof ReliabilityPage>[0]> = {},
) {
  return render(
    <ReliabilityPage
      costHistory={costHistory}
      data={operations}
      overview={null}
      podcastCosts={podcastCosts}
      {...overrides}
    />,
  );
}

describe('Reliability combines operational risk and cost', () => {
  it('puts ranked risk and cost waste on the same page', () => {
    renderPage();
    expect(screen.getByText('目前風險')).toBeVisible();
    expect(screen.getByText('成本總覽')).toBeVisible();
    expect(screen.getAllByText('10.0%').length).toBeGreaterThan(0);
  });

  it('names the workflow and its failure streak', () => {
    renderPage();
    expect(screen.getByText('ops-cost-sync.yml')).toBeVisible();
    expect(screen.getByText('4 連續失敗')).toBeVisible();
  });

  it('does not expose the priority score', () => {
    renderPage();
    expect(screen.queryByText('86')).toBeNull();
  });
});

describe('Reliability cost reading', () => {
  it('shows today spend as the delta from month-to-date accrual', () => {
    renderPage();
    expect(screen.getByText('Spend today')).toBeVisible();
    expect(screen.getByText('$4.00')).toBeVisible();
  });

  it('flags a provider whose daily spend is well above its recent run rate', () => {
    renderPage();
    expect(screen.getByText(/OpenRouter 花費上升/)).toBeVisible();
  });

  it('says nothing about providers whose daily spend stayed flat', () => {
    renderPage();
    expect(screen.queryByText(/Supabase 花費上升/)).toBeNull();
  });

  it('needs a full three-day daily baseline before calling anything an anomaly', () => {
    renderPage({
      costHistory: {
        ...costHistory,
        currentMonthDaily: costHistory.currentMonthDaily.slice(-3),
      },
    });
    expect(screen.queryByText(/花費上升/)).toBeNull();
  });

  it('reports an unavailable ledger instead of zero waste', () => {
    renderPage({
      podcastCosts: {
        episodes: [],
        generatedAt: '2026-09-10T01:00:00Z',
        message: 'column ops_pipeline_stage_runs.execution_id does not exist',
        status: 'error',
      },
    });
    expect(screen.getByText(/execution_id does not exist/)).toBeVisible();
  });
});

describe('Reliability backlog card', () => {
  const backlogOperations: OperationsResponse = {
    ...operations,
    agentBacklog: {
      blocked: 1,
      completed7d: 0,
      generatedAt: '2026-09-10T01:00:00Z',
      items: [
        {
          area: 'control-center',
          body: null,
          createdAt: '2026-09-10T00:00:00Z',
          issueNumber: 451,
          labels: ['agent-backlog'],
          risk: 'low',
          effort: null,
          fingerprint: null,
          status: 'ready',
          title: 'Add loading skeleton',
          updatedAt: '2026-09-10T01:00:00Z',
          url: 'https://github.com/zapPilot/zapEngine/issues/451',
        },
        {
          area: 'control-center',
          body: null,
          createdAt: '2026-09-10T00:00:00Z',
          issueNumber: 452,
          labels: ['agent-backlog', 'status:working'],
          risk: 'low',
          effort: null,
          fingerprint: null,
          status: 'working',
          title: 'Already in progress',
          updatedAt: '2026-09-10T01:00:00Z',
          url: 'https://github.com/zapPilot/zapEngine/issues/452',
        },
        {
          area: null,
          body: null,
          createdAt: '2026-09-10T00:00:00Z',
          issueNumber: 453,
          labels: ['agent-backlog', 'blocked'],
          risk: 'low',
          effort: null,
          fingerprint: null,
          status: 'blocked',
          title: 'Needs product judgement',
          updatedAt: '2026-09-10T01:00:00Z',
          url: 'https://github.com/zapPilot/zapEngine/issues/453',
        },
      ],
      message: null,
      ready: 1,
      repo: 'zapPilot/zapEngine',
      status: 'ok',
      truncated: false,
      working: 1,
    },
  };

  it('renders GitHub label state without lease wording', () => {
    renderPage({ data: backlogOperations });
    expect(screen.getByText('Marked status:working')).toBeVisible();
    expect(screen.getByText('working · control-center')).toBeVisible();
    expect(screen.getByText('blocked')).toBeVisible();
    expect(screen.queryByText(/claimed by/i)).toBeNull();
  });
});

describe('Reliability with nothing to report', () => {
  it('does not describe an unknown system as risk-free', () => {
    renderPage({
      data: {
        domains: [],
        generatedAt: '2026-09-10T01:00:00Z',
        priorities: [],
        signals: [],
        status: 'unknown',
      },
    });
    // The headline word and the status pill both say it.
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
    expect(screen.getByText('No workflow signal')).toBeVisible();
  });
});
