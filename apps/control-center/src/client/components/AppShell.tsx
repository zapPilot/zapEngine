import {
  Activity,
  Gauge,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { relativeTime } from '../format.js';
import { BrandMark } from './BrandMark.js';

export type DashboardView =
  | 'home'
  | 'growth'
  | 'product'
  | 'reliability'
  | 'economics';

const navigation = [
  { id: 'home' as const, label: 'Home', Icon: Gauge },
  { id: 'growth' as const, label: 'Growth', Icon: TrendingUp },
  { id: 'product' as const, label: 'Product', Icon: Users },
  { id: 'reliability' as const, label: 'Reliability', Icon: Activity },
  { id: 'economics' as const, label: 'Economics', Icon: Wallet },
];

export function AppShell(props: {
  activeView: DashboardView;
  children: ReactNode;
  /** Open decisions, badged on Reliability so leaving Home cannot hide them. */
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
        <div className="sidebar-note">
          <span className="live-dot" />
          Read-only operations view
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
