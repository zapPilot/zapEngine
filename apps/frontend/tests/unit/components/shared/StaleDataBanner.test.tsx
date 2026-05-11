import { render, screen } from '@testing-library/react';
import type { MarketDataFreshness } from '@zapengine/types';
import { describe, expect, it, vi } from 'vitest';

import { StaleDataBanner } from '@/components/shared/StaleDataBanner';

vi.mock('lucide-react', () => ({
  AlertCircle: () => <span data-testid="alert-icon">Alert</span>,
}));

function createStaleFreshness(
  overrides: Partial<MarketDataFreshness> = {},
): MarketDataFreshness {
  return {
    requested_date: '2024-01-01',
    effective_date: '2024-01-01',
    missing_dates: [],
    stale_features: [],
    max_lag_days: 0,
    is_stale: false,
    ...overrides,
  };
}

describe('StaleDataBanner', () => {
  describe('when freshness is_stale is false', () => {
    it('returns null', () => {
      const freshness = createStaleFreshness({ is_stale: false });
      const { container } = render(<StaleDataBanner freshness={freshness} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('when freshness is undefined', () => {
    it('returns null', () => {
      const { container } = render(
        <StaleDataBanner
          freshness={undefined as unknown as MarketDataFreshness}
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('when freshness is null', () => {
    it('returns null', () => {
      const { container } = render(
        <StaleDataBanner freshness={null as unknown as MarketDataFreshness} />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('when freshness is_stale is true', () => {
    it('renders the stale data banner', () => {
      const freshness = createStaleFreshness({
        is_stale: true,
        effective_date: '2024-01-01',
        stale_features: [
          {
            feature_name: 'sentiment',
            asset: 'BTC',
            requested_date: '2024-01-01',
            effective_date: '2024-01-01',
            lag_days: 2,
          },
        ],
      });
      render(<StaleDataBanner freshness={freshness} />);
      expect(screen.getByTestId('alert-icon')).toBeInTheDocument();
      expect(screen.getByText(/Market data updating/)).toBeInTheDocument();
    });

    it('displays the effective date', () => {
      const freshness = createStaleFreshness({
        is_stale: true,
        effective_date: '2024-03-15',
        stale_features: [],
      });
      render(<StaleDataBanner freshness={freshness} />);
      expect(screen.getByText(/2024-03-15/)).toBeInTheDocument();
    });

    it('displays all stale features', () => {
      const freshness = createStaleFreshness({
        is_stale: true,
        effective_date: '2024-01-01',
        stale_features: [
          {
            feature_name: 'sentiment',
            asset: 'BTC',
            requested_date: '2024-01-01',
            effective_date: '2024-01-01',
            lag_days: 2,
          },
          {
            feature_name: 'price',
            asset: 'ETH',
            requested_date: '2024-01-01',
            effective_date: '2024-01-01',
            lag_days: 3,
          },
        ],
      });
      render(<StaleDataBanner freshness={freshness} />);
      expect(screen.getByText(/BTC sentiment/)).toBeInTheDocument();
      expect(screen.getByText(/ETH price/)).toBeInTheDocument();
    });
  });
});
