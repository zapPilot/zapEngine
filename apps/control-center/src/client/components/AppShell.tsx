import {
  Activity,
  Clapperboard,
  Gauge,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { relativeTime } from '../format.js';
import { BrandMark } from './BrandMark.js';

/**
 * Product and Economics remain in the type temporarily so the old detail
 * components can be removed in a follow-up cleanup without coupling that
 * deletion to the information-architecture change. They are intentionally not
 * reachable from primary navigation.
 */
export type DashboardView =
  | 'home'
  | 'pipeline'
  | 'growth'
  | 'product'
  | 'reliability'
  | 'economics';

const navigation = [
  { id: 'home' as const, label: '今日', Icon: Gauge },
  { id: 'growth' as const, label: '成長', Icon: TrendingUp },
  { id: 'pipeline' as const, label: 'Pipeline', Icon: Clapperboard },
  { id: 'reliability' as const, label: '可靠性', Icon: Activity },
];

export function AppShell(props: {
  activeView: DashboardView;
  children: ReactNode;
  /** Open decisions, badged on Reliability so leaving Today cannot hide them. */
  decisionsPending?: number;
  generatedAt?: string;
  loading: boolean;
  onNavigate: (view: DashboardView) => void;
  onRefresh: () => void;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandMark />
          <span className="brand-text">
            <strong>Zap Pilot</strong>
            <small>Control Center</small>
          </span>
        </div>
        <nav aria-label="Control Center views" className="primary-nav">
          {navigation.map(({ id, label, Icon }) => (
            <button
              aria-current={props.activeView === id ? 'page' : undefined}
              className={
                props.activeView === id ? 'nav-item active' : 'nav-item'
              }
              key={id}
              onClick={() => props.onNavigate(id)}
              type="button"
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {id === 'reliability' && props.decisionsPending ? (
                <em className="nav-badge">{props.decisionsPending}</em>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-note sidebar-note-solo">
          <span className="live-dot" />
          <span>
            One operator. Four questions.
            <small>Decisions first · evidence on demand</small>
          </span>
        </div>
      </aside>
      <main className="main-canvas">
        <header className="page-header">
          <div className="page-title">
            <h1>{props.title}</h1>
            <p>{props.subtitle}</p>
          </div>
          <div className="header-actions">
            <span className="updated-at">
              {props.generatedAt
                ? `Updated ${relativeTime(props.generatedAt)}`
                : 'Waiting for data'}
            </span>
            <button
              className="refresh-button"
              disabled={props.loading}
              onClick={props.onRefresh}
              type="button"
            >
              <RefreshCw
                aria-hidden="true"
                className={props.loading ? 'spin' : undefined}
              />
              Refresh
            </button>
          </div>
        </header>
        {props.children}
      </main>
    </div>
  );
}
