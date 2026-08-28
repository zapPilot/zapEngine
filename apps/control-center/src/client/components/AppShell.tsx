import {
  Activity,
  BarChart3,
  LayoutDashboard,
  RefreshCw,
  Share2,
  Users,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { relativeTime } from '../format.js';

export type DashboardView =
  | 'overview'
  | 'operations'
  | 'customers'
  | 'costs'
  | 'social';

const navigation = [
  { id: 'overview' as const, label: 'Overview', Icon: LayoutDashboard },
  { id: 'operations' as const, label: 'Operations', Icon: Activity },
  { id: 'customers' as const, label: 'Customers', Icon: Users },
  { id: 'costs' as const, label: 'Costs', Icon: BarChart3 },
  { id: 'social' as const, label: 'Social', Icon: Share2 },
];

export function AppShell(props: {
  activeView: DashboardView;
  children: ReactNode;
  generatedAt?: string;
  loading: boolean;
  onNavigate: (view: DashboardView) => void;
  onRefresh: () => void;
  title: string;
}) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="Zap Pilot">
          <Zap aria-hidden="true" fill="currentColor" strokeWidth={1.8} />
          <span>ZAP PILOT</span>
        </div>
        <nav className="primary-nav" aria-label="Control Center views">
          {navigation.map(({ id, label, Icon }) => (
            <button
              className={
                props.activeView === id ? 'nav-item active' : 'nav-item'
              }
              key={id}
              onClick={() => props.onNavigate(id)}
              type="button"
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
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
          <h1>{props.title}</h1>
          <div className="header-actions">
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
              Refresh data
            </button>
            <span className="updated-at">
              {props.generatedAt
                ? `Updated ${relativeTime(props.generatedAt)}`
                : 'Waiting for data'}
            </span>
          </div>
        </header>
        {props.children}
      </main>
    </div>
  );
}
