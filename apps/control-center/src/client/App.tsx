import { useCallback, useEffect, useState } from 'react';

import type {
  CostHistoryResponse,
  CustomerEconomicsResponse,
  OperationsResponse,
  OperationsSocialResponse,
  OverviewResponse,
  SocialPerformanceResponse,
} from '../shared/types.js';
import { AppShell, type DashboardView } from './components/AppShell.js';
import { CostsView } from './components/CostsView.js';
import { CustomersView } from './components/CustomersView.js';
import { OperationsView } from './components/OperationsView.js';
import { OverviewView } from './components/OverviewView.js';
import { SocialView } from './components/SocialView.js';

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function App() {
  const [view, setView] = useState<DashboardView>('overview');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [costHistory, setCostHistory] = useState<CostHistoryResponse | null>(
    null,
  );
  const [social, setSocial] = useState<SocialPerformanceResponse | null>(null);
  const [operations, setOperations] = useState<OperationsResponse | null>(null);
  const [operationsSocial, setOperationsSocial] =
    useState<OperationsSocialResponse | null>(null);
  const [customers, setCustomers] = useState<CustomerEconomicsResponse | null>(
    null,
  );
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

  const loadOverview = useCallback(
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
        const [next, history] = await Promise.all([
          getJson<OverviewResponse>('/api/overview'),
          getJson<CostHistoryResponse>('/api/costs/history'),
        ]);
        setOverview(next);
        setCostHistory(history);
        setSocial(next.social);
      }),
    [run],
  );

  const loadSocial = useCallback(
    (window: SocialPerformanceResponse['window']) =>
      run(async () => {
        setSocial(
          await getJson<SocialPerformanceResponse>(
            `/api/social-performance?window=${encodeURIComponent(window)}`,
          ),
        );
      }),
    [run],
  );

  const loadOperations = useCallback(
    (force = false) =>
      run(async () => {
        const query = force ? '?force=1' : '';
        const [snapshot, socialOps] = await Promise.all([
          getJson<OperationsResponse>(`/api/operations${query}`),
          getJson<OperationsSocialResponse>(`/api/operations/social${query}`),
        ]);
        setOperations(snapshot);
        setOperationsSocial(socialOps);
      }),
    [run],
  );

  const loadCustomers = useCallback(
    (force = false) =>
      run(async () => {
        setCustomers(
          await getJson<CustomerEconomicsResponse>(
            `/api/customers${force ? '?force=1' : ''}`,
          ),
        );
      }),
    [run],
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Operations and Customers are only fetched once their tab is opened: both
  // fan out to several providers, and paying for that on every dashboard load
  // would make the Overview slower for no one's benefit.
  useEffect(() => {
    if (view === 'operations' && !operations) {
      void loadOperations();
    }
    if (view === 'customers' && !customers) {
      void loadCustomers();
    }
  }, [customers, loadCustomers, loadOperations, operations, view]);

  return (
    <AppShell
      activeView={view}
      generatedAt={generatedAt({
        view,
        overview,
        social,
        operations,
        customers,
      })}
      loading={loading}
      onNavigate={setView}
      onRefresh={() => {
        if (view === 'social' && social) {
          void loadSocial(social.window);
        } else if (view === 'operations') {
          void loadOperations(true);
        } else if (view === 'customers') {
          void loadCustomers(true);
        } else {
          // Local dev keeps the operator convenience of syncing costs before a
          // refresh. Production builds are read-only and only reread snapshots.
          void loadOverview(import.meta.env.DEV);
        }
      }}
      title={view === 'overview' ? 'Control Center' : titleCase(view)}
    >
      {error ? (
        <div className="error-state" role="alert">
          <strong>Control Center could not refresh.</strong>
          <span>{error}. Check the server process and provider access.</span>
        </div>
      ) : null}
      {view === 'overview' ? <OverviewView data={overview} /> : null}
      {view === 'operations' ? (
        <OperationsView data={operations} social={operationsSocial} />
      ) : null}
      {view === 'customers' ? <CustomersView data={customers} /> : null}
      {view === 'costs' ? (
        <CostsView data={overview} history={costHistory} />
      ) : null}
      {view === 'social' ? (
        <SocialView data={social} onWindowChange={loadSocial} />
      ) : null}
    </AppShell>
  );
}

function generatedAt(input: {
  view: DashboardView;
  overview: OverviewResponse | null;
  social: SocialPerformanceResponse | null;
  operations: OperationsResponse | null;
  customers: CustomerEconomicsResponse | null;
}): string | undefined {
  if (input.view === 'social') {
    return input.social?.generatedAt;
  }
  if (input.view === 'operations') {
    return input.operations?.generatedAt;
  }
  if (input.view === 'customers') {
    return input.customers?.generatedAt;
  }
  return input.overview?.generatedAt;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
