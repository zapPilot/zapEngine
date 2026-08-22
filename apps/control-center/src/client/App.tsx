import { useCallback, useEffect, useState } from 'react';

import type {
  CostHistoryResponse,
  OverviewResponse,
  SocialPerformanceResponse,
} from '../shared/types.js';
import { AppShell, type DashboardView } from './components/AppShell.js';
import { CostsView } from './components/CostsView.js';
import { OverviewView } from './components/OverviewView.js';
import { SocialView } from './components/SocialView.js';

export function App() {
  const [view, setView] = useState<DashboardView>('overview');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [costHistory, setCostHistory] = useState<CostHistoryResponse | null>(
    null,
  );
  const [social, setSocial] = useState<SocialPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (sync = false) => {
    setLoading(true);
    setError(null);
    try {
      if (sync) {
        const syncResponse = await fetch('/api/costs/sync', { method: 'POST' });
        if (!syncResponse.ok) {
          const body = (await syncResponse.json()) as { error?: string };
          throw new Error(body.error ?? `HTTP ${syncResponse.status}`);
        }
      }
      const [overviewResponse, historyResponse] = await Promise.all([
        fetch('/api/overview'),
        fetch('/api/costs/history'),
      ]);
      if (!overviewResponse.ok || !historyResponse.ok) {
        throw new Error(
          `HTTP ${!overviewResponse.ok ? overviewResponse.status : historyResponse.status}`,
        );
      }
      const next = (await overviewResponse.json()) as OverviewResponse;
      setOverview(next);
      setCostHistory((await historyResponse.json()) as CostHistoryResponse);
      setSocial(next.social);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSocial = useCallback(
    async (window: SocialPerformanceResponse['window']) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/social-performance?window=${encodeURIComponent(window)}`,
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        setSocial((await response.json()) as SocialPerformanceResponse);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Request failed');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return (
    <AppShell
      activeView={view}
      generatedAt={
        view === 'social' ? social?.generatedAt : overview?.generatedAt
      }
      loading={loading}
      onNavigate={setView}
      onRefresh={() => {
        if (view === 'social' && social) {
          void loadSocial(social.window);
        } else {
          void loadOverview(true);
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
      {view === 'costs' ? (
        <CostsView data={overview} history={costHistory} />
      ) : null}
      {view === 'social' ? (
        <SocialView data={social} onWindowChange={loadSocial} />
      ) : null}
    </AppShell>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
