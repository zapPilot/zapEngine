/**
 * DashboardView Ghost Mode Tests
 *
 * Tests that DashboardView correctly handles ghost mode
 * (isEmptyState) rendering with GhostModeOverlay.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DashboardView } from '@/components/wallet/portfolio/views/DashboardView';
import { GHOST_MODE_PREVIEW } from '@/constants/ghostModeData';

// Mock routing adapter
vi.mock('@/lib/routing', () => ({
  useAppSearchParams: () => new URLSearchParams(),
  useAppRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useAppPathname: () => '/bundle',
}));

// Mock all child components
vi.mock('@/components/layout/overlays/GhostModeOverlay', () => ({
  GhostModeOverlay: ({
    children,
    enabled,
    showCTA,
  }: {
    children: React.ReactNode;
    enabled: boolean;
    showCTA?: boolean;
  }) => (
    <div
      data-testid="ghost-mode-overlay"
      data-enabled={enabled}
      data-show-cta={showCTA !== false}
    >
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
  BalanceCard: ({
    balance,
    isEmptyState,
    lastUpdated,
  }: {
    balance: number;
    isEmptyState: boolean;
    lastUpdated?: string;
  }) => (
    <div
      data-testid="balance-card"
      data-balance={balance}
      data-empty={isEmptyState}
      data-last-updated={lastUpdated}
    >
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
  StrategyCard: ({ isEmptyState }: { isEmptyState: boolean }) => (
    <div data-testid="strategy-card" data-empty={isEmptyState}>
      Strategy Card
    </div>
  ),
}));

vi.mock('@/components/wallet/portfolio/views/DashboardSkeleton', () => ({
  BalanceCardSkeleton: () => <div>Balance Skeleton</div>,
  PortfolioCompositionSkeleton: () => <div>Composition Skeleton</div>,
}));

// Mock useAllocationWeights to avoid QueryClient dependency
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

describe('DashboardView Ghost Mode', () => {
  describe('when isEmptyState is true', () => {
    it('wraps BalanceCard with GhostModeOverlay enabled', () => {
      render(
        <DashboardView
          data={mockData}
          sections={mockSections}
          currentRegime={undefined}
          isEmptyState={true}
          onOpenModal={vi.fn()}
        />,
      );

      const overlays = screen.getAllByTestId('ghost-mode-overlay');
      expect(overlays.length).toBe(2); // BalanceCard and PortfolioComposition

      // First overlay (BalanceCard) should have showCTA=true (default)
      expect(overlays[0]).toHaveAttribute('data-enabled', 'true');
      expect(overlays[0]).toHaveAttribute('data-show-cta', 'true');
    });

    it('wraps PortfolioComposition with GhostModeOverlay but showCTA=false', () => {
      render(
        <DashboardView
          data={mockData}
          sections={mockSections}
          currentRegime={undefined}
          isEmptyState={true}
          onOpenModal={vi.fn()}
        />,
      );

      const overlays = screen.getAllByTestId('ghost-mode-overlay');

      // Second overlay (PortfolioComposition) should have showCTA=false
      expect(overlays[1]).toHaveAttribute('data-enabled', 'true');
      expect(overlays[1]).toHaveAttribute('data-show-cta', 'false');
    });

    it('renders BalanceCard directly (bypasses SectionWrapper)', () => {
      render(
        <DashboardView
          data={mockData}
          sections={mockSections}
          currentRegime={undefined}
          isEmptyState={true}
          onOpenModal={vi.fn()}
        />,
      );

      const balanceCard = screen.getByTestId('balance-card');
      expect(balanceCard).toBeInTheDocument();
      expect(balanceCard).toHaveAttribute(
        'data-last-updated',
        '2024-01-01T12:00:00Z',
      );
    });

    it('renders PortfolioComposition directly (bypasses SectionWrapper)', () => {
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

    it('renders StrategyCard without GhostModeOverlay', () => {
      render(
        <DashboardView
          data={mockData}
          sections={mockSections}
          currentRegime={undefined}
          isEmptyState={true}
          onOpenModal={vi.fn()}
        />,
      );

      const strategyCard = screen.getByTestId('strategy-card');
      expect(strategyCard).toBeInTheDocument();
      // StrategyCard should NOT be wrapped in GhostModeOverlay
      expect(
        strategyCard.closest('[data-testid="ghost-mode-overlay"]'),
      ).toBeNull();
    });
  });

  describe('when isEmptyState is false', () => {
    const sectionsWithData = {
      balance: { isLoading: false, data: { balance: 10000 }, error: null },
      composition: {
        isLoading: false,
        data: { targetAllocation: { crypto: 60, stable: 40 } },
        error: null,
      },
      strategy: { isLoading: false, data: {}, error: null },
      sentiment: { isLoading: false, data: { value: 50 }, error: null },
    };

    it('does not wrap components with GhostModeOverlay', () => {
      render(
        <DashboardView
          data={mockData}
          sections={sectionsWithData}
          currentRegime={undefined}
          isEmptyState={false}
          onOpenModal={vi.fn()}
        />,
      );

      expect(
        screen.queryByTestId('ghost-mode-overlay'),
      ).not.toBeInTheDocument();
    });

    it('uses SectionWrapper for progressive loading', () => {
      render(
        <DashboardView
          data={mockData}
          sections={sectionsWithData}
          currentRegime={undefined}
          isEmptyState={false}
          onOpenModal={vi.fn()}
        />,
      );

      expect(screen.getAllByTestId('section-wrapper').length).toBeGreaterThan(
        0,
      );
    });
  });
});
