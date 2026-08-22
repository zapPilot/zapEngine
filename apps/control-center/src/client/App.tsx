import { useCallback, useEffect, useState } from 'react';

import type {
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
  const [social, setSocial] = useState<SocialPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/overview${refresh ? '?refresh=1' : ''}`,
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const next = (await response.json()) as OverviewResponse;
      setOverview(next);
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
      {view === 'costs' ? <CostsView data={overview} /> : null}
      {view === 'social' ? (
        <SocialView data={social} onWindowChange={loadSocial} />
      ) : null}
    </AppShell>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
