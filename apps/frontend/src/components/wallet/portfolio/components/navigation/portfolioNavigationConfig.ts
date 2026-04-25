import {
  BarChart3,
  FlaskConical,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';

import type { InvestSubTab, TabType } from '@/types';

interface PortfolioTabConfig {
  id: TabType;
  label: string;
  icon: LucideIcon;
}

interface InvestSubTabConfig {
  id: InvestSubTab;
  label: string;
}

export const PORTFOLIO_TABS: PortfolioTabConfig[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'invest', label: 'Invest', icon: FlaskConical },
];

export const INVEST_SUB_TABS: InvestSubTabConfig[] = [
  { id: 'trading', label: 'trading' },
  { id: 'backtesting', label: 'backtesting' },
  { id: 'market', label: 'market data' },
  { id: 'config-manager', label: 'config manager' },
];
