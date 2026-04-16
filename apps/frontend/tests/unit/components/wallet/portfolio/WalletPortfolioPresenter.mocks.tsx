// Mock child components to simplify testing
vi.mock("@/components/wallet/portfolio/views/DashboardView", () => ({
  DashboardView: () => <div data-testid="dashboard-view">Dashboard View</div>,
}));

vi.mock("@/components/wallet/portfolio/analytics", () => ({
  AnalyticsView: () => (
    <div data-testid="analytics-content">Analytics Content</div>
  ),
}));

vi.mock("@/components/wallet/portfolio/views/strategy", () => ({
  StrategyView: () => (
    <div data-testid="strategy-content">Strategy Content</div>
  ),
}));

vi.mock("@/components/wallet/InitialDataLoadingState", () => ({
  InitialDataLoadingState: ({ status }: any) => (
    <div data-testid="initial-loading-state">Loading: {status}</div>
  ),
}));
