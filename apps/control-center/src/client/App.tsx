import { useCallback, useEffect, useState } from 'react';

import type { PodcastPipelineResponse } from '../shared/podcast-pipeline.js';
import type { StatementsResponse } from '../shared/statements.js';
import type {
  CostHistoryResponse,
  CustomerEconomicsResponse,
  OperationsResponse,
  OperationsSocialResponse,
  OverviewResponse,
  PodcastCostResponse,
  SocialPerformanceResponse,
  SocialGrowthResponse,
} from '../shared/types.js';
import { AppShell, type DashboardView } from './components/AppShell.js';
import { EconomicsView } from './components/EconomicsView.js';
import { GrowthDistributionBoard } from './components/GrowthDistributionBoard.js';
import { GrowthView } from './components/GrowthView.js';
import { HomeView } from './components/HomeView.js';
import { PodcastPipelineView } from './components/PodcastPipelineView.js';
import { ProductView } from './components/ProductView.js';
import { ReliabilityView } from './components/ReliabilityView.js';

const VIEW_META: Record<DashboardView, { subtitle: string; title: string }> = {
  home: {
    subtitle: 'What needs action',
    title: 'Home',
  },
  pipeline: {
    subtitle: 'Article production',
    title: 'Pipeline',
  },
  growth: {
    subtitle: 'Publishing and reach',
    title: 'Growth',
  },
  product: {
    subtitle: 'Customers and data',
    title: 'Product',
  },
  reliability: {
    subtitle: 'Systems and incidents',
    title: 'Reliability',
  },
  economics: {
    subtitle: 'Spend and unit cost',
    title: 'Economics',
  },
};

type PodcastRetryPhase = 'ingest' | 'video';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

async function retryPodcastPhase(
  episodeId: string,
  phase: PodcastRetryPhase,
): Promise<PodcastPipelineResponse> {
  const response = await fetch(
    `/api/podcast-pipeline/${encodeURIComponent(episodeId)}/${phase}/retry`,
    { method: 'POST' },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? `HTTP ${response.status}`);
  }
  return getJson<PodcastPipelineResponse>('/api/podcast-pipeline');
}

export function App() {
  const [view, setView] = useState<DashboardView>('home');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [costHistory, setCostHistory] = useState<CostHistoryResponse | null>(
    null,
  );
  const [podcastCosts, setPodcastCosts] = useState<PodcastCostResponse | null>(
    null,
  );
  const [podcastPipeline, setPodcastPipeline] =
    useState<PodcastPipelineResponse | null>(null);
  const [restartingEpisodeId, setRestartingEpisodeId] = useState<string | null>(
    null,
  );
  const [social, setSocial] = useState<SocialPerformanceResponse | null>(null);
  const [socialGrowth, setSocialGrowth] = useState<SocialGrowthResponse | null>(
    null,
  );
  const [operations, setOperations] = useState<OperationsResponse | null>(null);
  const [operationsSocial, setOperationsSocial] =
    useState<OperationsSocialResponse | null>(null);
  const [customers, setCustomers] = useState<CustomerEconomicsResponse | null>(
    null,
  );
  const [statements, setStatements] = useState<StatementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (work: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Home leads with the ranked action queue, so the operations snapshot is part
  // of the first paint rather than a tab-open cost. Its per-source caches make
  // the repeat reads cheap; the fan-out is paid once every few minutes.
  const loadHome = useCallback(
    (sync = false) =>
      run(async () => {
        if (sync) {
          const syncResponse = await fetch('/api/costs/sync', {
            method: 'POST',
          });
          if (!syncResponse.ok) {
            const body = (await syncResponse.json()) as { error?: string };
            throw new Error(body.error ?? `HTTP ${syncResponse.status}`);
          }
        }
        const [next, history, snapshot, episodeCosts, statementsNext] =
          await Promise.all([
            getJson<OverviewResponse>('/api/overview'),
            getJson<CostHistoryResponse>('/api/costs/history'),
            getJson<OperationsResponse>('/api/operations'),
            getJson<PodcastCostResponse>('/api/costs/podcast'),
            getJson<StatementsResponse>('/api/statements'),
          ]);
        setOverview(next);
        setCostHistory(history);
        setPodcastCosts(episodeCosts);
        setSocial(next.social);
        setOperations(snapshot);
        setStatements(statementsNext);
      }),
    [run],
  );

  const loadPipeline = useCallback(
    () =>
      run(async () => {
        const [pipeline, statementsNext] = await Promise.all([
          getJson<PodcastPipelineResponse>('/api/podcast-pipeline'),
          getJson<StatementsResponse>('/api/statements'),
        ]);
        setPodcastPipeline(pipeline);
        setStatements(statementsNext);
      }),
    [run],
  );

  const restartEpisodePhase = useCallback(
    (episodeId: string, phase: PodcastRetryPhase) => {
      setRestartingEpisodeId(episodeId);
      void run(async () => {
        setPodcastPipeline(await retryPodcastPhase(episodeId, phase));
      }).finally(() => setRestartingEpisodeId(null));
    },
    [run],
  );

  const restartIngest = useCallback(
    (episodeId: string) => restartEpisodePhase(episodeId, 'ingest'),
    [restartEpisodePhase],
  );

  const restartVideo = useCallback(
    (episodeId: string) => restartEpisodePhase(episodeId, 'video'),
    [restartEpisodePhase],
  );

  const loadSocial = useCallback(
    (window: SocialPerformanceResponse['window'], force = false) =>
      run(async () => {
        const query = force ? '?force=1' : '';
        const [performance, growth, socialOps, statementsNext] =
          await Promise.all([
            getJson<SocialPerformanceResponse>(
              `/api/social-performance?window=${encodeURIComponent(window)}`,
            ),
            getJson<SocialGrowthResponse>(`/api/social-growth${query}`),
            getJson<OperationsSocialResponse>(`/api/operations/social${query}`),
            getJson<StatementsResponse>(`/api/statements${query}`),
          ]);
        setSocial(performance);
        setSocialGrowth(growth);
        setOperationsSocial(socialOps);
        setStatements(statementsNext);
      }),
    [run],
  );

  const loadReliability = useCallback(
    (force = false) =>
      run(async () => {
        const query = force ? '?force=1' : '';
        const [snapshot, socialOps, statementsNext] = await Promise.all([
          getJson<OperationsResponse>(`/api/operations${query}`),
          getJson<OperationsSocialResponse>(`/api/operations/social${query}`),
          getJson<StatementsResponse>(`/api/statements${query}`),
        ]);
        setOperations(snapshot);
        setOperationsSocial(socialOps);
        setStatements(statementsNext);
      }),
    [run],
  );

  const loadCustomers = useCallback(
    (force = false) =>
      run(async () => {
        const query = force ? '?force=1' : '';
        const [customersNext, statementsNext] = await Promise.all([
          getJson<CustomerEconomicsResponse>(`/api/customers${query}`),
          getJson<StatementsResponse>(`/api/statements${query}`),
        ]);
        setCustomers(customersNext);
        setStatements(statementsNext);
      }),
    [run],
  );

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  // The pipeline, publish queue and per-customer ledger are view-specific. Keep
  // them lazy so Home remains a fast decision surface rather than preloading
  // every operational dataset on first paint.
  useEffect(() => {
    if (view === 'pipeline' && !podcastPipeline) {
      void loadPipeline();
    }
    if (view === 'reliability' && !operationsSocial) {
      void loadReliability();
    }
    if (view === 'product' && !customers) {
      void loadCustomers();
    }
    if (view === 'growth' && (!socialGrowth || !operationsSocial)) {
      void loadSocial(social?.window ?? 'latest');
    }
  }, [
    customers,
    loadCustomers,
    loadPipeline,
    loadReliability,
    loadSocial,
    operationsSocial,
    podcastPipeline,
    social,
    socialGrowth,
    view,
  ]);

  return (
    <AppShell
      activeView={view}
      decisionsPending={operations?.priorities.length}
      generatedAt={generatedAt({
        view,
        overview,
        social,
        operations,
        customers,
        podcastPipeline,
      })}
      loading={loading}
      onNavigate={setView}
      onRefresh={() => {
        if (view === 'pipeline') {
          void loadPipeline();
        } else if (view === 'growth') {
          void loadSocial(social?.window ?? 'latest', true);
        } else if (view === 'reliability') {
          void loadReliability(true);
        } else if (view === 'product') {
          void loadCustomers(true);
        } else {
          // Local dev keeps the operator convenience of syncing costs before a
          // refresh. Production builds only reread persisted cost snapshots.
          void loadHome(import.meta.env.DEV);
        }
      }}
      subtitle={
        view === 'home'
          ? (statements?.headers.find(
              (header) => header.domain === 'reliability',
            )?.facts[0]?.note ?? VIEW_META.home.subtitle)
          : VIEW_META[view].subtitle
      }
      title={view === 'home' ? homeDateTitle() : VIEW_META[view].title}
    >
      {error ? (
        <div className="error-state" role="alert">
          <strong>Control Center could not refresh.</strong>
          <span>{error}. Check the server process and provider access.</span>
        </div>
      ) : null}
      {view === 'home' ? (
        <HomeView
          data={overview}
          onNavigate={setView}
          operations={operations}
          statements={statements}
        />
      ) : null}
      {view === 'pipeline' ? (
        <PodcastPipelineView
          data={podcastPipeline}
          onRestartIngest={restartIngest}
          onRestartVideo={restartVideo}
          restartingEpisodeId={restartingEpisodeId}
          statements={statements}
        />
      ) : null}
      {view === 'reliability' ? (
        <ReliabilityView
          data={operations}
          social={operationsSocial}
          statements={statements}
        />
      ) : null}
      {view === 'product' ? (
        <ProductView
          customers={customers}
          product={overview?.product}
          statements={statements}
        />
      ) : null}
      {view === 'economics' ? (
        <EconomicsView
          data={overview}
          history={costHistory}
          podcastCosts={podcastCosts}
          statements={statements}
        />
      ) : null}
      {view === 'growth' ? (
        <div className="view-stack">
          <GrowthDistributionBoard
            performance={social}
            social={operationsSocial}
          />
          <GrowthView
            data={social}
            growth={socialGrowth}
            onWindowChange={loadSocial}
            statements={statements}
          />
        </div>
      ) : null}
    </AppShell>
  );
}
/** Home's H1 is the date, not a page name — "what changed today" over "what page is this". */
function homeDateTitle(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function generatedAt(input: {
  customers: CustomerEconomicsResponse | null;
  operations: OperationsResponse | null;
  overview: OverviewResponse | null;
  podcastPipeline: PodcastPipelineResponse | null;
  social: SocialPerformanceResponse | null;
  view: DashboardView;
}): string | undefined {
  if (input.view === 'pipeline') {
    return input.podcastPipeline?.generatedAt;
  }
  if (input.view === 'growth') {
    return input.social?.generatedAt;
  }
  if (input.view === 'reliability') {
    return input.operations?.generatedAt;
  }
  if (input.view === 'product') {
    return input.customers?.generatedAt;
  }
  return input.overview?.generatedAt;
}
