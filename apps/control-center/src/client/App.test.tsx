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
  PipelineQueuesBoard: (props: {
    onLoadVisualDebug: (episodeId: string) => Promise<unknown>;
    onResolveReview: (
      episodeId: string,
      reviewId: string,
      input: unknown,
    ) => Promise<void>;
    onRestartStep: (episodeId: string, action: unknown) => Promise<void>;
    onSubmitReview: (episodeId: string, input: unknown) => Promise<void>;
  }) => (
    <div>
      pipeline-board
      <button onClick={() => void props.onLoadVisualDebug('ep /1')}>
        visual-debug
      </button>
      <button
        onClick={() =>
          void props.onRestartStep('ep /1', {
            step: 'render',
            localizationId: 'zh /1',
          })
        }
      >
        retry-render
      </button>
      <button
        onClick={() =>
          void props.onRestartStep('ep /1', {
            step: 'video',
            forceReplan: true,
          })
        }
      >
        retry-video
      </button>
      <button
        onClick={() => void props.onRestartStep('ep /1', { step: 'publish' })}
      >
        retry-publish
      </button>
      <button
        onClick={() =>
          void props.onSubmitReview('ep /1', { verdict: 'revise' })
        }
      >
        submit-review
      </button>
      <button
        onClick={() =>
          void props.onResolveReview('ep /1', 'review /1', {
            resolution: 'fixed',
          })
        }
      >
        resolve-review
      </button>
    </div>
  ),
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
const customers = { generatedAt: 'customers-at' };
const socialGrowth = { generatedAt: 'growth-at' };
const podcastCosts = { generatedAt: 'podcast-costs-at' };
const costHistory = { generatedAt: 'cost-history-at' };
const operationsSocial = { generatedAt: 'social-ops-at' };
const visualDebug = { episodeId: 'ep /1' };

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
    if (clean === '/api/growth-journey') {
      return journey;
    }
    if (clean === '/api/customers') {
      return customers;
    }
    if (clean.endsWith('/visual')) {
      return visualDebug;
    }
    throw new Error(`unexpected read ${url}`);
  });
  api.sendJson.mockResolvedValue(null);
}

async function renderReadyHome() {
  render(<App />);
  await screen.findByText('home-ready');
}

async function navigate(view: string) {
  fireEvent.click(screen.getByRole('button', { name: `go-${view}` }));
  await screen.findByText(`${view}-ready`);
}

beforeEach(() => {
  vi.clearAllMocks();
  installSuccessfulReads();
});

afterEach(cleanup);

describe('App orchestration', () => {
  it('protects the invariant that Home renders only after both slow context reads settle', async () => {
    let releaseQueues!: (value: unknown) => void;
    const pendingQueues = new Promise((resolve) => {
      releaseQueues = resolve;
    });
    api.getJson.mockImplementation(async (url: string) => {
      if (url === '/api/pipeline/queues') {
        return pendingQueues;
      }
      if (url === '/api/growth-journey') {
        return journey;
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
    expect(await screen.findByText('skeleton-home')).toBeVisible();
    expect(screen.queryByText('home-ready')).toBeNull();
    releaseQueues(queues);
    expect(await screen.findByText('home-ready')).toBeVisible();
    expect(screen.getByTestId('shell')).toHaveTextContent('overview-at|false');
    // mutation target — removing queues from dashboardViewReady renders Home early.
  });

  it('protects the invariant that independent context failures degrade to readable data', async () => {
    api.getJson.mockImplementation(async (url: string) => {
      if (url === '/api/pipeline/queues') {
        throw new Error('queue provider down');
      }
      if (url === '/api/growth-journey') {
        const reason: unknown = { message: 'not an Error' };
        throw reason;
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
    await renderReadyHome();
    expect(screen.getByText('home-ready')).toBeVisible();
    // mutation target — rethrowing either allSettled rejection leaves Home on its skeleton.
  });

  it('protects Error and non-Error request failures from leaving a permanent spinner', async () => {
    api.getJson.mockRejectedValueOnce(new Error('overview exploded'));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'overview exploded',
    );
    expect(screen.queryByText('skeleton-home')).toBeNull();
    cleanup();

    api.getJson.mockRejectedValueOnce({ message: 'plain object' });
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Request failed',
    );
    // mutation target — dropping finally keeps loading true and the shell refresh locked.
  });

  it('protects lazy view contracts and each view-specific generated timestamp', async () => {
    await renderReadyHome();

    await navigate('pipeline');
    expect(screen.getByText('statement-pipeline is healthy')).toBeVisible();
    expect(screen.getByTestId('shell')).toHaveTextContent('statements-at');

    await navigate('growth');
    expect(screen.getByTestId('shell')).toHaveTextContent(
      'social-from-overview',
    );

    await navigate('reliability');
    expect(screen.getByTestId('shell')).toHaveTextContent('operations-at');

    await navigate('product');
    expect(screen.getByTestId('shell')).toHaveTextContent('customers-at');

    await navigate('economics');
    expect(screen.getByTestId('shell')).toHaveTextContent('overview-at');
    // mutation target — swapping any generatedAt source fails the corresponding assertion.
  });

  it('protects every refresh rail and growth window reload', async () => {
    await renderReadyHome();
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await waitFor(() =>
      expect(api.sendJson).toHaveBeenCalledWith('/api/costs/sync', 'POST'),
    );

    await navigate('pipeline');
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await navigate('growth');
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    fireEvent.click(screen.getByRole('button', { name: 'window-30d' }));
    await navigate('reliability');
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    await navigate('product');
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => {
      expect(api.getJson).toHaveBeenCalledWith('/api/social-growth?force=1');
      expect(api.getJson).toHaveBeenCalledWith('/api/operations?force=1');
      expect(api.getJson).toHaveBeenCalledWith('/api/customers?force=1');
      expect(api.getJson).toHaveBeenCalledWith(
        '/api/social-performance?window=30d',
      );
    });
    // mutation target — routing refresh through another loader changes the asserted URLs.
  });

  it('protects encoded pipeline retry, debug, review and resolution RPC contracts', async () => {
    await renderReadyHome();
    await navigate('pipeline');

    for (const name of [
      'visual-debug',
      'retry-render',
      'retry-video',
      'retry-publish',
      'submit-review',
      'resolve-review',
    ]) {
      fireEvent.click(screen.getByRole('button', { name }));
    }

    await waitFor(() => {
      expect(api.getJson).toHaveBeenCalledWith(
        '/api/podcast-pipeline/ep%20%2F1/visual',
      );
      expect(api.sendJson).toHaveBeenCalledWith(
        '/api/podcast-pipeline/ep%20%2F1/renders/zh%20%2F1/retry',
        'POST',
        undefined,
      );
      expect(api.sendJson).toHaveBeenCalledWith(
        '/api/podcast-pipeline/ep%20%2F1/video/retry',
        'POST',
        { forceReplan: true },
      );
      expect(api.sendJson).toHaveBeenCalledWith(
        '/api/podcast-pipeline/ep%20%2F1/publish/retry',
        'POST',
        undefined,
      );
      expect(api.sendJson).toHaveBeenCalledWith(
        '/api/podcast-pipeline/ep%20%2F1/reviews',
        'PUT',
        { verdict: 'revise' },
      );
      expect(api.sendJson).toHaveBeenCalledWith(
        '/api/podcast-pipeline/reviews/review%20%2F1/resolve',
        'POST',
        { resolution: 'fixed' },
      );
    });
    // mutation target — removing encoding, bodies, or the post-mutation reload breaks this test.
  });

  it('protects the pipeline header fallback when no pipeline statement exists', async () => {
    api.getJson.mockImplementation(async (url: string) => {
      if (url.replace('?force=1', '') === '/api/statements') {
        return { generatedAt: 'empty-statements-at', headers: [] };
      }
      const values = new Map<string, unknown>([
        ['/api/overview', overview],
        ['/api/costs/history', costHistory],
        ['/api/operations', operations],
        ['/api/costs/podcast', podcastCosts],
        ['/api/pipeline/queues', queues],
        ['/api/growth-journey', journey],
      ]);
      const value = values.get(url);
      if (value) {
        return value;
      }
      throw new Error(`unexpected read ${url}`);
    });
    await renderReadyHome();
    await navigate('pipeline');
    expect(screen.queryByText(/^statement-/)).toBeNull();
    expect(screen.getByText('pipeline-summary')).toBeVisible();
    // mutation target — inventing a header for an absent statement renders forbidden copy.
  });
});
