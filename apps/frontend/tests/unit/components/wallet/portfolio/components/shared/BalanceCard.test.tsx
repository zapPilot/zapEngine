/**
 * Unit tests for BalanceCard component
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BalanceCard } from '@/components/wallet/portfolio/components/shared/BalanceCard';

// Mock the DataFreshnessIndicator
vi.mock(
  '@/components/wallet/portfolio/components/shared/DataFreshnessIndicator',
  () => ({
    DataFreshnessIndicator: ({ lastUpdated }: { lastUpdated: string }) => (
      <div data-testid="freshness-indicator">{lastUpdated}</div>
    ),
  }),
);

// Mock the skeleton
vi.mock('@/components/wallet/portfolio/views/DashboardSkeleton', () => ({
  BalanceCardSkeleton: () => (
    <div data-testid="balance-skeleton">Loading...</div>
  ),
}));

vi.mock(
  '@/components/wallet/portfolio/components/shared/HealthFactorPill',
  () => ({
    HealthFactorPill: () => <div data-testid="health-factor-pill">Health</div>,
  }),
);

vi.mock(
  '@/components/wallet/portfolio/components/shared/BorrowingHealthPill',
  () => ({
    BorrowingHealthPill: () => (
      <div data-testid="borrowing-health-pill">Borrowing</div>
    ),
  }),
);

vi.mock(
  '@/components/wallet/portfolio/components/shared/HealthWarningBanner',
  () => ({
    HealthWarningBanner: () => (
      <div data-testid="health-warning-banner">Warning</div>
    ),
  }),
);

describe('BalanceCard', () => {
  const mockOnOpenModal = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render loading skeleton when isLoading is true', () => {
      render(
        <BalanceCard
          balance={10000}
          isLoading={true}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('balance-skeleton')).toBeInTheDocument();
      expect(screen.queryByTestId('net-worth')).not.toBeInTheDocument();
    });

    it('should render balance when not loading', () => {
      render(
        <BalanceCard
          balance={10000}
          isLoading={false}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('net-worth')).toHaveTextContent('$10,000');
    });

    it('should format large balance correctly', () => {
      render(<BalanceCard balance={1234567} onOpenModal={mockOnOpenModal} />);

      expect(screen.getByTestId('net-worth')).toHaveTextContent('$1,234,567');
    });
  });

  describe('Empty State', () => {
    it('should apply empty state styling to balance', () => {
      render(
        <BalanceCard
          balance={0}
          isEmptyState={true}
          onOpenModal={mockOnOpenModal}
        />,
      );

      const netWorth = screen.getByTestId('net-worth');
      expect(netWorth).toHaveClass('text-gray-600');
    });

    it('should disable buttons when in empty state', () => {
      render(
        <BalanceCard
          balance={0}
          isEmptyState={true}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('deposit-button')).toBeDisabled();
      expect(screen.getByTestId('withdraw-button')).toBeDisabled();
    });
  });

  describe('Active State', () => {
    it('should apply active styling to balance', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          onOpenModal={mockOnOpenModal}
        />,
      );

      const netWorth = screen.getByTestId('net-worth');
      expect(netWorth).toHaveClass('text-white');
    });

    it('should enable buttons when not in empty state', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('deposit-button')).not.toBeDisabled();
      expect(screen.getByTestId('withdraw-button')).not.toBeDisabled();
    });

    it('should have cursor-pointer on enabled buttons', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('deposit-button')).toHaveClass(
        'cursor-pointer',
      );
      expect(screen.getByTestId('withdraw-button')).toHaveClass(
        'cursor-pointer',
      );
    });

    it('should have cursor-not-allowed on disabled buttons', () => {
      render(
        <BalanceCard
          balance={0}
          isEmptyState={true}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('deposit-button')).toHaveClass(
        'cursor-not-allowed',
      );
      expect(screen.getByTestId('withdraw-button')).toHaveClass(
        'cursor-not-allowed',
      );
    });
  });

  describe('Button Actions', () => {
    it("should call onOpenModal with 'deposit' when deposit button clicked", () => {
      render(<BalanceCard balance={10000} onOpenModal={mockOnOpenModal} />);

      fireEvent.click(screen.getByTestId('deposit-button'));

      expect(mockOnOpenModal).toHaveBeenCalledWith('deposit');
    });

    it("should call onOpenModal with 'withdraw' when withdraw button clicked", () => {
      render(<BalanceCard balance={10000} onOpenModal={mockOnOpenModal} />);

      fireEvent.click(screen.getByTestId('withdraw-button'));

      expect(mockOnOpenModal).toHaveBeenCalledWith('withdraw');
    });
  });

  describe('Visitor Mode (isOwnBundle)', () => {
    it('should enable buttons when viewing own bundle', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          isOwnBundle={true}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('deposit-button')).not.toBeDisabled();
      expect(screen.getByTestId('withdraw-button')).not.toBeDisabled();
    });

    it("should disable buttons when viewing another user's bundle", () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          isOwnBundle={false}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('deposit-button')).toBeDisabled();
      expect(screen.getByTestId('withdraw-button')).toBeDisabled();
    });

    it('should show tooltip hint on buttons when in visitor mode', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          isOwnBundle={false}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('deposit-button')).toHaveAttribute(
        'title',
        'Switch to your bundle to deposit',
      );
      expect(screen.getByTestId('withdraw-button')).toHaveAttribute(
        'title',
        'Switch to your bundle to withdraw',
      );
    });

    it('should not show tooltip hint when viewing own bundle', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          isOwnBundle={true}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('deposit-button')).not.toHaveAttribute('title');
      expect(screen.getByTestId('withdraw-button')).not.toHaveAttribute(
        'title',
      );
    });

    it('should default isOwnBundle to true', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          onOpenModal={mockOnOpenModal}
        />,
      );

      // Without passing isOwnBundle, buttons should be enabled (default = true)
      expect(screen.getByTestId('deposit-button')).not.toBeDisabled();
      expect(screen.getByTestId('withdraw-button')).not.toBeDisabled();
    });

    it('should disable buttons when both empty state AND visitor mode', () => {
      render(
        <BalanceCard
          balance={0}
          isEmptyState={true}
          isOwnBundle={false}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('deposit-button')).toBeDisabled();
      expect(screen.getByTestId('withdraw-button')).toBeDisabled();
    });
  });

  describe('Data Freshness', () => {
    it('should show DataFreshnessIndicator when lastUpdated is provided and not empty state', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          lastUpdated="2025-01-01"
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('freshness-indicator')).toBeInTheDocument();
    });

    it('should not show DataFreshnessIndicator when in empty state', () => {
      render(
        <BalanceCard
          balance={0}
          isEmptyState={true}
          lastUpdated="2025-01-01"
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(
        screen.queryByTestId('freshness-indicator'),
      ).not.toBeInTheDocument();
    });

    it('should not show DataFreshnessIndicator when lastUpdated is null', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          lastUpdated={null}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(
        screen.queryByTestId('freshness-indicator'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Leverage Health', () => {
    it('shows HealthFactorPill when has_leverage and health_rate are truthy', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          riskMetrics={{ has_leverage: true, health_rate: 1.5 } as any}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('health-factor-pill')).toBeInTheDocument();
    });

    it('shows HealthWarningBanner when leverage health is shown', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          riskMetrics={{ has_leverage: true, health_rate: 1.2 } as any}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('health-warning-banner')).toBeInTheDocument();
    });

    it('does not show HealthFactorPill without has_leverage', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          riskMetrics={{ has_leverage: false, health_rate: 1.5 } as any}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(
        screen.queryByTestId('health-factor-pill'),
      ).not.toBeInTheDocument();
    });

    it('does not show HealthFactorPill in empty state', () => {
      render(
        <BalanceCard
          balance={0}
          isEmptyState={true}
          riskMetrics={{ has_leverage: true, health_rate: 1.5 } as any}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(
        screen.queryByTestId('health-factor-pill'),
      ).not.toBeInTheDocument();
    });

    it('does not show HealthFactorPill when health_rate is falsy', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          riskMetrics={{ has_leverage: true, health_rate: 0 } as any}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(
        screen.queryByTestId('health-factor-pill'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Borrowing Alert', () => {
    it('shows BorrowingHealthPill when has_debt is truthy', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          borrowingSummary={{ has_debt: true } as any}
          userId="0x123"
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(screen.getByTestId('borrowing-health-pill')).toBeInTheDocument();
    });

    it('does not show BorrowingHealthPill without has_debt', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          borrowingSummary={{ has_debt: false } as any}
          userId="0x123"
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(
        screen.queryByTestId('borrowing-health-pill'),
      ).not.toBeInTheDocument();
    });

    it('does not show BorrowingHealthPill in empty state', () => {
      render(
        <BalanceCard
          balance={0}
          isEmptyState={true}
          borrowingSummary={{ has_debt: true } as any}
          userId="0x123"
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(
        screen.queryByTestId('borrowing-health-pill'),
      ).not.toBeInTheDocument();
    });

    it('does not show BorrowingHealthPill without userId', () => {
      render(
        <BalanceCard
          balance={10000}
          isEmptyState={false}
          borrowingSummary={{ has_debt: true } as any}
          onOpenModal={mockOnOpenModal}
        />,
      );

      expect(
        screen.queryByTestId('borrowing-health-pill'),
      ).not.toBeInTheDocument();
    });
  });
});
