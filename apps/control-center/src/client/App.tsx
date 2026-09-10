import { useCallback, useEffect, useState } from 'react';

import type { PodcastPipelineRestartAction } from '../shared/podcast-pipeline.js';
import type {
  PodcastVideoReviewInput,
  PodcastVideoReviewResolveInput,
  PodcastVisualDebugResponse,
} from '../shared/podcast-visual.js';
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
import { getJson, sendJson } from './api.js';
import { AppShell, type DashboardView } from './components/AppShell.js';
import { EconomicsView } from './components/EconomicsView.js';
import {
  GrowthFocusView,
  ReliabilityFocusView,
  TodayView,
} from './components/FocusedOperatorViews.js';
import { PipelineQueuesBoard } from './components/PipelineQueuesBoard.js';
import { ProductView } from './components/ProductView.js';
import { StatementHeader } from './components/StatementHeader.js';
import './solo-operator.css';

const VIEW_META: Record<DashboardView, { subtitle: string; title: string }> = {
  home: {
    subtitle: '現在最值得你花時間處理的事',
    title: '今日',
  },
  pipeline: {
    subtitle: 'API → Render → Social：正在跑什麼、卡在哪裡',
    title: 'Pipeline',
  },
  growth: {
    subtitle: '把流量、內容與 waitlist 放在同一條 journey 裡看',
    title: '成長',
  },
  product: {
    subtitle: 'Customers and data',
    title: 'Product',
  },
  reliability: {
    subtitle: '系統健康、營運風險與成本浪費',
    title: '可靠性',
  },
  economics: {
    subtitle: 'Spend and unit cost',
    title: 'Economics',
  },
};

async function retryPodcastStep(
  episodeId: string,
  action: PodcastPipelineRestartAction,
): Promise<void> {
  const encodedEpisodeId = encodeURIComponent(episodeId);
  const url =
    action.step === 'render'
      ? `/api/podcast-pipeline/${encodedEpisodeId}/renders/${encodeURIComponent(action.localizationId)}/retry`
      : `/api/podcast-pipeline/${encodedEpisodeId}/${action.step}/retry`;
  await sendJson(
    url,
    'POST',
    action.step === 'video' ? { forceReplan: action.forceReplan } : undefined,
  );
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
  const [visualDebugByEpisode, setVisualDebugByEpisode] = useState<
    Record<string, PodcastVisualDebugResponse | undefined>
  >({});
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

  // Today is the operator inbox. It composes existing read models rather than
  // creating another server contract: overview supplies company pulse and
  // release data, operations supplies ranked intervention candidates, and the
  // persisted podcast ledger supplies retry waste.
  const loadHome = useCallback(
    (sync = false) =>
      run(async () => {
        if (sync) {
          await sendJson('/api/costs/sync', 'POST');
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

  // The board polls the queue endpoint itself; the view only needs the
  // statement sentence that heads it.
  const loadPipeline = useCallback(
    () =>
      run(async () => {
        setStatements(await getJson<StatementsResponse>('/api/statements'));
      }),
    [run],
  );

  // Rethrows so the drawer can put the RPC's own refusal — a live lease, an
  // abandoned episode, a missing migration — next to the button that caused it
  // rather than in the page-level banner.
  const restartStep = useCallback(
    async (episodeId: string, action: PodcastPipelineRestartAction) => {
      await retryPodcastStep(episodeId, action);
      setVisualDebugByEpisode((current) => {
        const next = { ...current };
        delete next[episodeId];
        return next;
      });
    },
    [],
  );

  const loadVisualDebug = useCallback(async (episodeId: string) => {
    const debug = await getJson<PodcastVisualDebugResponse>(
      `/api/podcast-pipeline/${encodeURIComponent(episodeId)}/visual`,
    );
    setVisualDebugByEpisode((current) => ({ ...current, [episodeId]: debug }));
    return debug;
  }, []);

  const submitReview = useCallback(
    async (episodeId: string, review: PodcastVideoReviewInput) => {
      await sendJson(
        `/api/podcast-pipeline/${encodeURIComponent(episodeId)}/reviews`,
        'PUT',
        review,
      );
      await loadVisualDebug(episodeId);
    },
    [loadVisualDebug],
  );

  const resolveReview = useCallback(
    async (
      episodeId: string,
      reviewId: string,
      input: PodcastVideoReviewResolveInput,
    ) => {
      await sendJson(
        `/api/podcast-pipeline/reviews/${encodeURIComponent(reviewId)}/resolve`,
        'POST',
        input,
      );
      await loadVisualDebug(episodeId);
    },
    [loadVisualDebug],
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

  // Reliability owns cost risk as well as system risk. Refreshing it therefore
  // refreshes the same persisted cost summaries Today reads instead of showing
  // an old Economics snapshot beside fresh operational signals.
  const loadReliability = useCallback(
    (force = false) =>
      run(async () => {
        const query = force ? '?force=1' : '';
        const [snapshot, socialOps, statementsNext, next, episodeCosts] =
          await Promise.all([
            getJson<OperationsResponse>(`/api/operations${query}`),
            getJson<OperationsSocialResponse>(`/api/operations/social${query}`),
            getJson<StatementsResponse>(`/api/statements${query}`),
            getJson<OverviewResponse>('/api/overview'),
            getJson<PodcastCostResponse>('/api/costs/podcast'),
          ]);
        setOperations(snapshot);
        setOperationsSocial(socialOps);
        setStatements(statementsNext);
        setOverview(next);
        setPodcastCosts(episodeCosts);
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

  // Pipeline and Growth stay lazy. Product/Economics are intentionally absent
  // from primary navigation in this IA pass; their components remain available
  // for a separate cleanup after the new surfaces have settled.
  useEffect(() => {
    if (view === 'pipeline' && !statements) {
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
    social,
    socialGrowth,
    statements,
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
        statements,
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
      subtitle={VIEW_META[view].subtitle}
      title={VIEW_META[view].title}
    >
      {error ? (
        <div className="error-state" role="alert">
          <strong>Control Center could not refresh.</strong>
          <span>{error}. Check the server process and provider access.</span>
        </div>
      ) : null}
      {view === 'home' ? (
        <TodayView
          data={overview}
          onNavigate={setView}
          operations={operations}
          podcastCosts={podcastCosts}
        />
      ) : null}
      {view === 'pipeline' ? (
        <div className="view-stack">
          <PipelineStatement statements={statements} />
          <PipelineQueuesBoard
            onLoadVisualDebug={loadVisualDebug}
            onResolveReview={resolveReview}
            onRestartStep={restartStep}
            onSubmitReview={submitReview}
            visualDebugByEpisode={visualDebugByEpisode}
          />
        </div>
      ) : null}
      {view === 'reliability' ? (
        <ReliabilityFocusView
          data={operations}
          overview={overview}
          podcastCosts={podcastCosts}
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
        <GrowthFocusView
          data={social}
          growth={socialGrowth}
          onWindowChange={loadSocial}
          statements={statements}
        />
      ) : null}
    </AppShell>
  );
}

/** The one-sentence read on production health that used to head the retired
 * episode panel. It is the only part of that view the queue board does not
 * already say better. */
function PipelineStatement(props: { statements: StatementsResponse | null }) {
  const header = props.statements?.headers.find(
    (entry) => entry.domain === 'pipeline',
  );
  if (!header) {
    return null;
  }
  return (
    <StatementHeader
      facts={header.facts}
      sentence={header.sentence}
      status={header.status}
    />
  );
}

function generatedAt(input: {
  customers: CustomerEconomicsResponse | null;
  operations: OperationsResponse | null;
  overview: OverviewResponse | null;
  statements: StatementsResponse | null;
  social: SocialPerformanceResponse | null;
  view: DashboardView;
}): string | undefined {
  if (input.view === 'pipeline') {
    return input.statements?.generatedAt;
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
