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
  episodes: [],
  generatedAt: '2026-09-10T01:00:00Z',
  message: null,
  status: 'ok',
};

describe('ReliabilityPage coverage3', () => {
  it('renders cost overview with a null cost history', () => {
    render(
      <ReliabilityPage
        costHistory={null as unknown as CostHistoryResponse}
        data={operations}
        overview={null}
        podcastCosts={podcastCosts}
      />,
    );
    expect(screen.getByText('No daily reading yet')).toBeVisible();
    expect(screen.getByText('Spend today')).toBeVisible();
  });
});
