import { useCallback, useEffect, useState } from 'react';

import type { SocialGrowthJourney } from '../shared/growth-journey.js';
import type { PipelineQueuesResponse } from '../shared/pipeline-queues.js';
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
import { DashboardSkeleton } from './components/DashboardSkeleton.js';
import { EconomicsView } from './components/EconomicsView.js';
import { PipelineQueuesBoard } from './components/PipelineQueuesBoard.js';
import { ProductView } from './components/ProductView.js';
import { StatementHeader } from './components/StatementHeader.js';
import { GrowthPage } from './pages/GrowthPage.js';
import { PipelineSummary } from './pages/PipelinePage.js';
import { ReliabilityPage } from './pages/ReliabilityPage.js';
import { TodayPage } from './pages/TodayPage.js';

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
  const [queues, setQueues] = useState<PipelineQueuesResponse | null>(null);
  const [journey, setJourney] = useState<SocialGrowthJourney | null>(null);
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
        const [statementsNext, episodeCosts] = await Promise.all([
          getJson<StatementsResponse>('/api/statements'),
          getJson<PodcastCostResponse>('/api/costs/podcast'),
        ]);
        setStatements(statementsNext);
        setPodcastCosts(episodeCosts);
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
        const [
          snapshot,
          socialOps,
          statementsNext,
          next,
          episodeCosts,
          history,
        ] = await Promise.all([
          getJson<OperationsResponse>(`/api/operations${query}`),
          getJson<OperationsSocialResponse>(`/api/operations/social${query}`),
          getJson<StatementsResponse>(`/api/statements${query}`),
          getJson<OverviewResponse>('/api/overview'),
          getJson<PodcastCostResponse>('/api/costs/podcast'),
          getJson<CostHistoryResponse>('/api/costs/history'),
        ]);
        setOperations(snapshot);
        setOperationsSocial(socialOps);
        setStatements(statementsNext);
        setOverview(next);
        setPodcastCosts(episodeCosts);
        setCostHistory(history);
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

  // Today's queue and analytics cards are a second wave on purpose: both reads
  // are slow (the queue payload is large, the journey query hits PostHog) and
  // neither is needed for the operator inbox at the top of the page. They also
  // settle independently, so one provider being down cannot blank the other.
  const loadTodayContext = useCallback(async () => {
    const [queuesNext, journeyNext] = await Promise.allSettled([
      getJson<PipelineQueuesResponse>('/api/pipeline/queues'),
      getJson<SocialGrowthJourney>('/api/growth-journey'),
    ]);
    setQueues(
      queuesNext.status === 'fulfilled'
        ? queuesNext.value
        : unreadableQueues(queuesNext.reason),
    );
    setJourney(
      journeyNext.status === 'fulfilled'
        ? journeyNext.value
        : unavailableJourney(journeyNext.reason),
    );
  }, []);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useEffect(() => {
    if (
      (view === 'home' || view === 'pipeline' || view === 'growth') &&
      !queues
    ) {
      void loadTodayContext();
    }
  }, [loadTodayContext, queues, view]);

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

  const viewReady = dashboardViewReady({
    costHistory,
    customers,
    journey,
    operations,
    overview,
    podcastCosts,
    queues,
    social,
    socialGrowth,
    statements,
    view,
  });

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
      {!error && !viewReady ? <DashboardSkeleton view={view} /> : null}
      {viewReady && view === 'home' ? (
        <TodayPage
          data={overview}
          journey={journey}
          onNavigate={setView}
          operations={operations}
          podcastCosts={podcastCosts}
          queues={queues}
        />
      ) : null}
      {viewReady && view === 'pipeline' ? (
        <div className="cc-stack">
          <PipelineStatement statements={statements} />
          <PipelineSummary podcastCosts={podcastCosts} queues={queues} />
          <PipelineQueuesBoard
            onLoadVisualDebug={loadVisualDebug}
            onResolveReview={resolveReview}
            onRestartStep={restartStep}
            onSubmitReview={submitReview}
            visualDebugByEpisode={visualDebugByEpisode}
          />
        </div>
      ) : null}
      {viewReady && view === 'reliability' ? (
        <ReliabilityPage
          costHistory={costHistory}
          data={operations}
          overview={overview}
          podcastCosts={podcastCosts}
        />
      ) : null}
      {viewReady && view === 'product' ? (
        <ProductView
          customers={customers}
          product={overview?.product}
          statements={statements}
        />
      ) : null}
      {viewReady && view === 'economics' ? (
        <EconomicsView
          data={overview}
          history={costHistory}
          podcastCosts={podcastCosts}
          statements={statements}
        />
      ) : null}
      {viewReady && view === 'growth' ? (
        <GrowthPage
          data={social}
          growth={socialGrowth}
          journey={journey}
          onWindowChange={loadSocial}
        />
      ) : null}
    </AppShell>
  );
}

/** A failed read is reported in the shape the panel already understands, so a
 * transport error and a provider outage render the same way instead of leaving
 * the card spinning forever. */
function unreadableQueues(reason: unknown): PipelineQueuesResponse {
  const empty = { attention: [], processing: [], queued: [] };
  return {
    api: empty,
    generatedAt: new Date().toISOString(),
    message: reason instanceof Error ? reason.message : 'Queue read failed',
    render: empty,
    social: empty,
    status: 'error',
    summary: {
      abandoned: 0,
      blockedOrFailed: 0,
      processing: 0,
      publishedToday: 0,
      queueDepth: 0,
    },
  };
}

function unavailableJourney(reason: unknown): SocialGrowthJourney {
  return {
    appVisitors30d: null,
    ctaUsers30d: null,
    landingDirect30d: null,
    landingOther30d: null,
    landingRednote30d: null,
    landingThreads30d: null,
    landingVisitors30d: null,
    landingX30d: null,
    landingYoutube30d: null,
    message: reason instanceof Error ? reason.message : 'Analytics read failed',
    status: 'unavailable',
    walletConnectedUsers30d: null,
  };
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

function dashboardViewReady(input: {
  costHistory: CostHistoryResponse | null;
  customers: CustomerEconomicsResponse | null;
  journey: SocialGrowthJourney | null;
  operations: OperationsResponse | null;
  overview: OverviewResponse | null;
  podcastCosts: PodcastCostResponse | null;
  queues: PipelineQueuesResponse | null;
  social: SocialPerformanceResponse | null;
  socialGrowth: SocialGrowthResponse | null;
  statements: StatementsResponse | null;
  view: DashboardView;
}): boolean {
  if (input.view === 'home') {
    return Boolean(
      input.overview &&
        input.operations &&
        input.podcastCosts &&
        input.queues &&
        input.journey,
    );
  }
  if (input.view === 'pipeline') {
    return Boolean(input.statements && input.podcastCosts && input.queues);
  }
  if (input.view === 'growth') {
    return Boolean(input.social && input.socialGrowth && input.journey);
  }
  if (input.view === 'reliability') {
    return Boolean(
      input.operations &&
        input.overview &&
        input.podcastCosts &&
        input.costHistory,
    );
  }
  if (input.view === 'product') {
    return Boolean(input.customers && input.overview && input.statements);
  }
  return Boolean(
    input.overview &&
      input.costHistory &&
      input.podcastCosts &&
      input.statements,
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
