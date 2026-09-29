// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getJson: vi.fn(), sendJson: vi.fn() }));

vi.mock('./api.js', () => api);
vi.mock('./components/AppShell.js', () => ({
  AppShell: (props: {
    activeView: string;
    children: ReactNode;
    generatedAt?: string;
    loading: boolean;
    onNavigate: (view: string) => void;
    onRefresh: () => void;
    subtitle: string;
    title: string;
  }) => (
    <main>
      <output data-testid="shell">
        {props.activeView}|{props.title}|{props.subtitle}|
        {props.generatedAt ?? 'waiting'}|{String(props.loading)}
      </output>
      {[
        'home',
        'pipeline',
        'growth',
        'product',
        'reliability',
        'economics',
      ].map((view) => (
        <button key={view} onClick={() => props.onNavigate(view)}>
          go-{view}
        </button>
      ))}
      <button onClick={props.onRefresh}>refresh</button>
      {props.children}
    </main>
  ),
}));
vi.mock('./components/DashboardSkeleton.js', () => ({
  DashboardSkeleton: ({ view }: { view: string }) => <div>skeleton-{view}</div>,
}));
vi.mock('./components/EconomicsView.js', () => ({
  EconomicsView: () => <div>economics-ready</div>,
}));
vi.mock('./components/ProductView.js', () => ({
  ProductView: () => <div>product-ready</div>,
}));
vi.mock('./components/StatementHeader.js', () => ({
  StatementHeader: ({ sentence }: { sentence: string }) => (
    <div>statement-{sentence}</div>
  ),
}));
vi.mock('./pages/TodayPage.js', () => ({
  TodayPage: () => <div>home-ready</div>,
}));
vi.mock('./pages/PipelinePage.js', () => ({
  PipelineSummary: () => <div>pipeline-summary</div>,
}));
vi.mock('./pages/ReliabilityPage.js', () => ({
  ReliabilityPage: () => <div>reliability-ready</div>,
}));
vi.mock('./pages/GrowthPage.js', () => ({
  GrowthPage: (props: { onWindowChange: (window: string) => void }) => (
    <div>
      growth-ready
      <button onClick={() => props.onWindowChange('30d')}>window-30d</button>
    </div>
  ),
}));
vi.mock('./components/PipelineQueuesBoard.js', () => ({
  PipelineQueuesBoard: () => <div>pipeline-ready</div>,
}));

import { App } from './App.js';

const overview = {
  generatedAt: 'overview-at',
  product: {},
  social: { generatedAt: 'social-from-overview', window: 'latest' },
};
const operations = { generatedAt: 'operations-at', priorities: [{ id: 'p1' }] };
const statements = {
  generatedAt: 'statements-at',
  headers: [
    {
      domain: 'pipeline',
      facts: [],
      sentence: 'pipeline is healthy',
      status: 'healthy',
    },
  ],
};
const queues = { generatedAt: 'queues-at', status: 'ok', summary: {} };
const journey = { status: 'ok' };
const acquisition = {
  journey,
  lanes: [],
  community: { status: 'unavailable' },
  laneSources: {},
};
const customers = { generatedAt: 'customers-at' };
const socialGrowth = { generatedAt: 'growth-at' };
const podcastCosts = { generatedAt: 'podcast-costs-at' };
const costHistory = { generatedAt: 'cost-history-at' };
const operationsSocial = { generatedAt: 'social-ops-at' };

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('App coverage3', () => {
  it('refreshes growth with the latest fallback while social is still null', async () => {
    let releaseHome!: (v: unknown) => void;
    let releaseSocial!: (v: unknown) => void;
    const homeGate = new Promise((resolve) => {
      releaseHome = resolve;
    });
    const socialGate = new Promise((resolve) => {
      releaseSocial = resolve;
    });
    api.getJson.mockImplementation(async (url: string) => {
      const clean = url.replace('?force=1', '');
      if (clean.startsWith('/api/social-performance')) {
        return socialGate.then(() => ({ ...overview.social, window: '30d' }));
      }
      if (clean === '/api/social-growth') {
        return socialGate.then(() => socialGrowth);
      }
      if (clean === '/api/operations/social') {
        return socialGate.then(() => operationsSocial);
      }
      if (clean === '/api/growth') {
        return acquisition;
      }
      if (clean === '/api/statements') {
        return statements;
      }
      if (clean === '/api/customers') {
        return customers;
      }
      if (url === '/api/overview') {
        return homeGate.then(() => overview);
      }
      if (url === '/api/costs/history') {
        return homeGate.then(() => costHistory);
      }
      if (url === '/api/operations') {
        return homeGate.then(() => operations);
      }
      if (url === '/api/costs/podcast') {
        return homeGate.then(() => podcastCosts);
      }
      if (url === '/api/pipeline/queues') {
        return queues;
      }
      throw new Error(`unexpected read ${url}`);
    });
    api.sendJson.mockResolvedValue(null);

    render(<App />);
    // Jump to growth before home resolves: social state is still null.
    fireEvent.click(screen.getByRole('button', { name: 'go-growth' }));
    // The lazy growth effect uses the 'latest' fallback without force.
    await waitFor(() =>
      expect(api.getJson).toHaveBeenCalledWith(
        '/api/social-performance?window=latest',
      ),
    );
    // Refresh while social is still null: the onRefresh growth rail must also
    // use the 'latest' fallback, this time with force for the sibling reads.
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await waitFor(() =>
      expect(api.getJson).toHaveBeenCalledWith('/api/social-growth?force=1'),
    );
    expect(api.getJson).toHaveBeenCalledWith(
      '/api/social-performance?window=latest',
    );

    releaseSocial(overview.social);
    releaseHome(overview);
    await screen.findByText('growth-ready');
  });
});
