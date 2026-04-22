/**
 * DashboardView tests for the shouldShowGhostMode=false branch
 * (when URL contains a userId param — i.e., public bundle page view).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DashboardView } from '@/components/wallet/portfolio/views/DashboardView';
import { GHOST_MODE_PREVIEW } from '@/constants/ghostModeData';

// Mock routing adapter — return a URLSearchParams WITH a userId
vi.mock('@/lib/routing', () => ({
  useAppSearchParams: () => new URLSearchParams('userId=0xabc123'),
  useAppRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useAppPathname: () => '/bundle',
}));

vi.mock('@/components/layout/overlays/GhostModeOverlay', () => ({
  GhostModeOverlay: ({
    children,
    enabled,
  }: {
    children: React.ReactNode;
    enabled: boolean;
  }) => (
    <div data-testid="ghost-mode-overlay" data-enabled={enabled}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/shared/SectionWrapper', () => ({
  SectionWrapper: ({
    children,
    state,
  }: {
    children: (data: unknown) => React.ReactNode;
    state: { data?: unknown };
  }) => (
    <div data-testid="section-wrapper">
      {state.data && children(state.data)}
    </div>
  ),
}));

vi.mock('@/components/wallet/portfolio/components/shared', () => ({
  BalanceCard: ({ balance }: { balance: number; isEmptyState: boolean }) => (
    <div data-testid="balance-card" data-balance={balance}>
      Balance Card
    </div>
  ),
  PortfolioComposition: ({ isEmptyState }: { isEmptyState: boolean }) => (
    <div data-testid="portfolio-composition" data-empty={isEmptyState}>
      Portfolio Composition
    </div>
  ),
}));

vi.mock('@/components/wallet/portfolio/components/StrategyCard', () => ({
  StrategyCard: () => <div data-testid="strategy-card">Strategy Card</div>,
}));

vi.mock('@/components/wallet/portfolio/views/DashboardSkeleton', () => ({
  BalanceCardSkeleton: () => <div>Balance Skeleton</div>,
  PortfolioCompositionSkeleton: () => <div>Composition Skeleton</div>,
}));

vi.mock('@/hooks/queries/analytics/useAllocationWeights', () => ({
  useAllocationWeights: vi.fn().mockReturnValue({
    data: {
      btc_weight: 0.6,
      eth_weight: 0.4,
      btc_market_cap: 1800000000000,
      eth_market_cap: 400000000000,
      is_fallback: false,
    },
    isLoading: false,
    error: null,
  }),
}));

const mockData = {
  balance: GHOST_MODE_PREVIEW.balance,
  currentAllocation: GHOST_MODE_PREVIEW.currentAllocation,
  targetAllocation: { crypto: 60, stable: 40 },
  delta: GHOST_MODE_PREVIEW.delta,
  lastUpdated: '2024-01-01T12:00:00Z',
} as Parameters<typeof DashboardView>[0]['data'];

const mockSections = {
  balance: { isLoading: false, data: null, error: null },
  composition: { isLoading: false, data: null, error: null },
  strategy: { isLoading: false, data: null, error: null },
  sentiment: { isLoading: false, data: null, error: null },
};

describe('DashboardView — public bundle URL (userId in search params)', () => {
  it('does not wrap BalanceCard with GhostModeOverlay when userId is in URL', () => {
    // shouldShowGhostMode = false because urlUserId is set
    render(
      <DashboardView
        data={mockData}
        sections={mockSections}
        currentRegime={undefined}
        isEmptyState={true}
        onOpenModal={vi.fn()}
      />,
    );

    // GhostModeOverlay should NOT be rendered at all
    expect(screen.queryByTestId('ghost-mode-overlay')).not.toBeInTheDocument();
  });

  it('still renders BalanceCard directly when isEmptyState is true and userId in URL', () => {
    render(
      <DashboardView
        data={mockData}
        sections={mockSections}
        currentRegime={undefined}
        isEmptyState={true}
        onOpenModal={vi.fn()}
      />,
    );

    expect(screen.getByTestId('balance-card')).toBeInTheDocument();
  });

  it('still renders PortfolioComposition directly when isEmptyState is true and userId in URL', () => {
    render(
      <DashboardView
        data={mockData}
        sections={mockSections}
        currentRegime={undefined}
        isEmptyState={true}
        onOpenModal={vi.fn()}
      />,
    );

    expect(screen.getByTestId('portfolio-composition')).toBeInTheDocument();
  });
});
