/**
 * PortfolioComposition Component Tests
 *
 * Tests for the Portfolio Composition UI including:
 * - Drift indicator display and color coding
 * - Target and Current Portfolio bars
 * - Loading and empty states
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WalletPortfolioDataWithDirection } from '@/adapters/walletPortfolioDataAdapter';
import { PortfolioComposition } from '@/components/wallet/portfolio/components/shared/PortfolioComposition';

// Mock getRegimeAllocation to avoid deep dependency chain
vi.mock('@/components/wallet/regime/regimeData', () => ({
  getRegimeAllocation: vi.fn().mockReturnValue({
    spot: 40,
    stable: 60,
  }),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Zap: () => <svg data-testid="zap-icon" />,
}));

// Mock GradientButton to avoid icon issues
vi.mock('@/components/ui', () => ({
  GradientButton: ({
    children,
    disabled,
    ...props
  }: React.PropsWithChildren<{
    disabled?: boolean;
    'data-testid'?: string;
  }>) => (
    <button disabled={disabled} data-testid={props['data-testid']}>
      {children}
    </button>
  ),
}));

// Mock the skeleton component
vi.mock('@/components/wallet/portfolio/views/DashboardSkeleton', () => ({
  PortfolioCompositionSkeleton: () => (
    <div data-testid="composition-skeleton">Loading...</div>
  ),
}));

// Mock useAllocationWeights to avoid QueryClient dependency
vi.mock('@/hooks/queries/analytics/useAllocationWeights', () => ({
  useAllocationWeights: vi.fn().mockReturnValue({
    data: {
      btc_weight: 0.6,
      eth_weight: 0.4,
      btc_market_cap: 1800000000000,
      eth_market_cap: 400000000000,
      timestamp: '2024-01-15T12:00:00Z',
      is_fallback: false,
      cached: false,
    },
    isLoading: false,
    error: null,
  }),
}));

const mockData: WalletPortfolioDataWithDirection = {
  totalBalance: 10000,
  currentAllocation: {
    crypto: 60,
    stable: 40,
    simplifiedCrypto: [
      {
        asset: 'bitcoin',
        symbol: 'BTC',
        name: 'Bitcoin',
        value: 35,
        color: '#F7931A',
      },
      {
        asset: 'ethereum',
        symbol: 'ETH',
        name: 'Ethereum',
        value: 15,
        color: '#627EEA',
      },
      {
        asset: 'solana',
        symbol: 'SOL',
        name: 'Solana',
        value: 10,
        color: '#6B7280',
      },
    ],
  },
  delta: 5.5,
  direction: 'below',
};

describe('PortfolioComposition', () => {
  const mockOnRebalance = vi.fn();

  describe('Rendering', () => {
    it('renders the composition bar with title', () => {
      render(
        <PortfolioComposition
          data={mockData}
          currentRegime="Risk-On"
          onRebalance={mockOnRebalance}
        />,
      );

      expect(screen.getByText('Portfolio Composition')).toBeInTheDocument();
    });

    it('renders target and current portfolio labels', () => {
      render(
        <PortfolioComposition
          data={mockData}
          currentRegime="Risk-On"
          onRebalance={mockOnRebalance}
        />,
      );

      expect(screen.getByText('Target Allocation')).toBeInTheDocument();
      expect(screen.getByText('Current Portfolio')).toBeInTheDocument();
    });

    it('renders the rebalance button', () => {
      render(
        <PortfolioComposition
          data={mockData}
          currentRegime="Risk-On"
          onRebalance={mockOnRebalance}
        />,
      );

      expect(screen.getByTestId('rebalance-button')).toBeInTheDocument();
    });

    it('renders allocation legend items', () => {
      render(
        <PortfolioComposition
          data={mockData}
          currentRegime="Risk-On"
          onRebalance={mockOnRebalance}
        />,
      );

      // Check for legend items (unified categories: BTC, ETH, ALT, STABLE)
      expect(screen.getAllByText('BTC')[0]).toBeInTheDocument();
      expect(screen.getAllByText('ETH')[0]).toBeInTheDocument();
      expect(screen.getAllByText('ALT')[0]).toBeInTheDocument();
      // We expect multiple '40%' from the target/current stable segments.
      expect(screen.getAllByText('40%').length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Drift Indicator', () => {
    it('displays drift percentage in the header', () => {
      render(
        <PortfolioComposition
          data={mockData}
          currentRegime="Risk-On"
          onRebalance={mockOnRebalance}
        />,
      );

      expect(screen.getByText(/Drift: 5.5%/)).toBeInTheDocument();
    });

    it('applies orange color when drift exceeds 5%', () => {
      const highDriftData = { ...mockData, delta: 7.2 };
      render(
        <PortfolioComposition
          data={highDriftData}
          currentRegime="Risk-On"
          onRebalance={mockOnRebalance}
        />,
      );

      const driftElement = screen.getByText(/Drift: 7.2%/);
      expect(driftElement).toHaveClass('text-orange-400');
    });

    it('applies gray color when drift is at or below 5%', () => {
      const lowDriftData = { ...mockData, delta: 3.0 };
      render(
        <PortfolioComposition
          data={lowDriftData}
          currentRegime="Risk-On"
          onRebalance={mockOnRebalance}
        />,
      );

      const driftElement = screen.getByText(/Drift: 3.0%/);
      expect(driftElement).toHaveClass('text-gray-500');
    });
  });

  describe('Loading State', () => {
    it('renders skeleton when isLoading is true', () => {
      render(
        <PortfolioComposition
          data={mockData}
          currentRegime="Risk-On"
          isLoading={true}
          onRebalance={mockOnRebalance}
        />,
      );

      expect(screen.getByTestId('composition-skeleton')).toBeInTheDocument();
      expect(
        screen.queryByText('Portfolio Composition'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('disables rebalance button when isEmptyState is true', () => {
      render(
        <PortfolioComposition
          data={mockData}
          currentRegime="Risk-On"
          isEmptyState={true}
          onRebalance={mockOnRebalance}
        />,
      );

      expect(screen.getByTestId('rebalance-button')).toBeDisabled();
    });
  });

  describe('Target Allocation Fallback', () => {
    it('returns null when no target and no regime provided', () => {
      const { container } = render(
        <PortfolioComposition
          data={mockData}
          currentRegime={undefined}
          targetAllocation={undefined}
          onRebalance={mockOnRebalance}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it('renders when targetAllocation prop is provided without regime', () => {
      render(
        <PortfolioComposition
          data={mockData}
          currentRegime={undefined}
          targetAllocation={{ crypto: 50, stable: 50 }}
          onRebalance={mockOnRebalance}
        />,
      );

      expect(screen.getByText('Portfolio Composition')).toBeInTheDocument();
    });
  });

  describe('Visitor Mode (isOwnBundle)', () => {
    it('enables rebalance button when viewing own bundle', () => {
      render(
        <PortfolioComposition
          data={mockData}
          currentRegime="Risk-On"
          isEmptyState={false}
          isOwnBundle={true}
          onRebalance={mockOnRebalance}
        />,
      );

      expect(screen.getByTestId('rebalance-button')).not.toBeDisabled();
    });

    it("disables rebalance button when viewing another user's bundle", () => {
      render(
        <PortfolioComposition
          data={mockData}
          currentRegime="Risk-On"
          isEmptyState={false}
          isOwnBundle={false}
          onRebalance={mockOnRebalance}
        />,
      );

      expect(screen.getByTestId('rebalance-button')).toBeDisabled();
    });

    it('defaults isOwnBundle to true', () => {
      render(
        <PortfolioComposition
          data={mockData}
          currentRegime="Risk-On"
          isEmptyState={false}
          onRebalance={mockOnRebalance}
        />,
      );

      // Without passing isOwnBundle, button should be enabled (default = true)
      expect(screen.getByTestId('rebalance-button')).not.toBeDisabled();
    });

    it('disables button when both empty state AND visitor mode', () => {
      render(
        <PortfolioComposition
          data={mockData}
          currentRegime="Risk-On"
          isEmptyState={true}
          isOwnBundle={false}
          onRebalance={mockOnRebalance}
        />,
      );

      expect(screen.getByTestId('rebalance-button')).toBeDisabled();
    });
  });
});
