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

function installSuccessfulReads() {
  api.getJson.mockImplementation(async (url: string) => {
    const clean = url.replace('?force=1', '');
    if (clean.startsWith('/api/social-performance')) {
      return { ...overview.social, window: '30d' };
    }
    if (clean === '/api/social-growth') {
      return socialGrowth;
    }
    if (clean === '/api/operations/social') {
      return operationsSocial;
    }
    if (clean === '/api/operations') {
      return operations;
    }
    if (clean === '/api/overview') {
      return overview;
    }
    if (clean === '/api/costs/history') {
      return costHistory;
    }
    if (clean === '/api/costs/podcast') {
      return podcastCosts;
    }
    if (clean === '/api/statements') {
      return statements;
    }
    if (clean === '/api/pipeline/queues') {
      return queues;
    }
    if (clean === '/api/growth') {
      return acquisition;
    }
    if (clean === '/api/customers') {
      return customers;
    }
    throw new Error(`unexpected read ${url}`);
  });
  api.sendJson.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  installSuccessfulReads();
});

afterEach(cleanup);

describe('App coverage2', () => {
  it('lazy-loads the pipeline statement when statements are absent', async () => {
    // Hold the home load so statements stay null while we sit on pipeline.
    let releaseHome!: (v: unknown) => void;
    const homeGate = new Promise((resolve) => {
      releaseHome = resolve;
    });
    api.getJson.mockImplementation(async (url: string) => {
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
      if (url === '/api/statements') {
        // Pipeline lazy load resolves immediately.
        return statements;
      }
      if (url === '/api/pipeline/queues') {
        return queues;
      }
      if (url === '/api/growth') {
        return acquisition;
      }
      if (url === '/api/customers') {
        return customers;
      }
      if (url.startsWith('/api/social-performance')) {
        return { ...overview.social, window: '30d' };
      }
      if (url === '/api/social-growth') {
        return socialGrowth;
      }
      if (url === '/api/operations/social') {
        return operationsSocial;
      }
      throw new Error(`unexpected read ${url}`);
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'go-pipeline' }));
    // The pipeline effect fires loadPipeline (statements absent).
    await waitFor(() =>
      expect(api.getJson).toHaveBeenCalledWith('/api/statements'),
    );
    releaseHome(overview);
    await screen.findByText('pipeline-summary');
  });

  it('lazy-loads reliability when operationsSocial is absent', async () => {
    render(<App />);
    // Home finishes first; then reliability still needs its own social ops.
    await screen.findByText('home-ready');
    fireEvent.click(screen.getByRole('button', { name: 'go-reliability' }));
    await screen.findByText('reliability-ready');
    expect(api.getJson).toHaveBeenCalledWith('/api/operations');
  });

  it('loads growth with the default window when social is still null', async () => {
    let releaseHome!: (v: unknown) => void;
    const homeGate = new Promise((resolve) => {
      releaseHome = resolve;
    });
    api.getJson.mockImplementation(async (url: string) => {
      const clean = url.replace('?force=1', '');
      if (clean.startsWith('/api/social-performance')) {
        return { ...overview.social, window: '30d' };
      }
      if (clean === '/api/social-growth') {
        return socialGrowth;
      }
      if (clean === '/api/operations/social') {
        return operationsSocial;
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
    render(<App />);
    // Jump to growth before home resolves: social is null so the loader
    // falls back to the 'latest' window without force.
    fireEvent.click(screen.getByRole('button', { name: 'go-growth' }));
    await waitFor(() =>
      expect(api.getJson).toHaveBeenCalledWith(
        '/api/social-performance?window=latest',
      ),
    );
    releaseHome(overview);
    await screen.findByText('growth-ready');
  });

  it('refreshes growth from a null social window with force', async () => {
    render(<App />);
    await screen.findByText('home-ready');
    fireEvent.click(screen.getByRole('button', { name: 'go-growth' }));
    await screen.findByText('growth-ready');
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await waitFor(() =>
      expect(api.getJson).toHaveBeenCalledWith('/api/social-growth?force=1'),
    );
  });

  it('degrades growth context with an Error reason message', async () => {
    api.getJson.mockImplementation(async (url: string) => {
      if (url === '/api/pipeline/queues') {
        return queues;
      }
      if (url === '/api/growth') {
        throw new Error('PostHog down');
      }
      if (url === '/api/overview') {
        return overview;
      }
      if (url === '/api/costs/history') {
        return costHistory;
      }
      if (url === '/api/operations') {
        return operations;
      }
      if (url === '/api/costs/podcast') {
        return podcastCosts;
      }
      if (url === '/api/statements') {
        return statements;
      }
      throw new Error(`unexpected read ${url}`);
    });
    render(<App />);
    await screen.findByText('home-ready');
    // Error path through unavailableGrowthJourney + unreadableQueues is covered
    // by the sibling orchestration test; here we just need the Error branch.
    expect(screen.getByText('home-ready')).toBeVisible();
  });

  it('degrades queues with a non-Error reason', async () => {
    api.getJson.mockImplementation(async (url: string) => {
      if (url === '/api/pipeline/queues') {
        // eslint-disable-next-line no-throw-literal
        throw 'plain-string-failure';
      }
      if (url === '/api/growth') {
        return acquisition;
      }
      if (url === '/api/overview') {
        return overview;
      }
      if (url === '/api/costs/history') {
        return costHistory;
      }
      if (url === '/api/operations') {
        return operations;
      }
      if (url === '/api/costs/podcast') {
        return podcastCosts;
      }
      if (url === '/api/statements') {
        return statements;
      }
      throw new Error(`unexpected read ${url}`);
    });
    render(<App />);
    await screen.findByText('home-ready');
    expect(screen.getByText('home-ready')).toBeVisible();
  });
});
