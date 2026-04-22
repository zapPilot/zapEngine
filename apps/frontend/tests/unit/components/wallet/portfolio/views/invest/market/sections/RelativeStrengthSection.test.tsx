import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RelativeStrengthSection } from '@/components/wallet/portfolio/views/invest/market/sections/RelativeStrengthSection';
import { useMarketDashboardQuery } from '@/hooks/queries/market/useMarketDashboardQuery';

vi.mock('@/hooks/queries/market/useMarketDashboardQuery', () => ({
  useMarketDashboardQuery: vi.fn(),
}));

vi.mock('recharts', async () => {
  const { createRechartsChartContainer, createRechartsMockComponent } =
    await import('../../../../../../../../utils/rechartsMocks');

  const ComposedChart = createRechartsChartContainer();

  return {
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => (
      <div>{children}</div>
    ),
    ComposedChart,
    CartesianGrid: () => null,
    XAxis: createRechartsMockComponent(() => null),
    YAxis: createRechartsMockComponent(() => null),
    Tooltip: createRechartsMockComponent(() => null),
    Legend: () => null,
    Line: createRechartsMockComponent(() => null),
    ReferenceDot: createRechartsMockComponent(
      ({ x, y }: { x?: string; y?: number }) => (
        <div data-testid="reference-dot" data-x={x} data-y={y} />
      ),
    ),
  };
});

const mockUseMarketDashboardQuery = vi.mocked(useMarketDashboardQuery);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryWrapper';
  return Wrapper;
}

function makeQueryResult(
  overrides: Partial<ReturnType<typeof useMarketDashboardQuery>>,
): ReturnType<typeof useMarketDashboardQuery> {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    isPending: false,
    isSuccess: false,
    isFetching: false,
    isRefetching: false,
    isLoadingError: false,
    isRefetchError: false,
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: 'idle',
    status: 'pending',
    isFetched: false,
    isFetchedAfterMount: false,
    isInitialLoading: false,
    isPlaceholderData: false,
    isStale: false,
    refetch: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useMarketDashboardQuery>;
}

const baseSnapshot = {
  snapshot_date: '2025-01-01',
  price_usd: 42000,
  dma_200: 38000,
  sentiment_value: 65,
  regime: 'g' as const,
};

describe('RelativeStrengthSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows ETH leading when is_above_dma is true', async () => {
    mockUseMarketDashboardQuery.mockReturnValue(
      makeQueryResult({
        data: {
          snapshots: [
            {
              ...baseSnapshot,
              eth_btc_relative_strength: {
                ratio: 0.05,
                dma_200: 0.04,
                is_above_dma: true,
              },
            },
          ],
          count: 1,
          token_symbol: 'btc',
          days_requested: 1900,
          timestamp: '2025-01-01T00:00:00Z',
        },
        isLoading: false,
        isSuccess: true,
        status: 'success',
      }),
    );

    render(<RelativeStrengthSection />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getAllByText('ETH leading').length).toBeGreaterThan(0);
    });
  });

  it('shows BTC leading when is_above_dma is false', async () => {
    mockUseMarketDashboardQuery.mockReturnValue(
      makeQueryResult({
        data: {
          snapshots: [
            {
              ...baseSnapshot,
              eth_btc_relative_strength: {
                ratio: 0.03,
                dma_200: 0.05,
                is_above_dma: false,
              },
            },
          ],
          count: 1,
          token_symbol: 'btc',
          days_requested: 1900,
          timestamp: '2025-01-01T00:00:00Z',
        },
        isLoading: false,
        isSuccess: true,
        status: 'success',
      }),
    );

    render(<RelativeStrengthSection />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getAllByText('BTC leading').length).toBeGreaterThan(0);
    });
  });

  it('shows Insufficient data when is_above_dma is null', async () => {
    mockUseMarketDashboardQuery.mockReturnValue(
      makeQueryResult({
        data: {
          snapshots: [
            {
              ...baseSnapshot,
              eth_btc_relative_strength: {
                ratio: 0.04,
                dma_200: null,
                is_above_dma: null,
              },
            },
          ],
          count: 1,
          token_symbol: 'btc',
          days_requested: 1900,
          timestamp: '2025-01-01T00:00:00Z',
        },
        isLoading: false,
        isSuccess: true,
        status: 'success',
      }),
    );

    render(<RelativeStrengthSection />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getAllByText('Insufficient data').length).toBeGreaterThan(
        0,
      );
    });
  });

  it('shows loading spinner when isLoading is true', () => {
    mockUseMarketDashboardQuery.mockReturnValue(
      makeQueryResult({
        data: undefined,
        isLoading: true,
        isPending: true,
        status: 'pending',
        fetchStatus: 'fetching',
      }),
    );

    const { container } = render(<RelativeStrengthSection />, {
      wrapper: createWrapper(),
    });

    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('renders ReferenceDot elements when is_above_dma flips between snapshots', async () => {
    mockUseMarketDashboardQuery.mockReturnValue(
      makeQueryResult({
        data: {
          snapshots: [
            {
              ...baseSnapshot,
              snapshot_date: '2025-01-01',
              eth_btc_relative_strength: {
                ratio: 0.03,
                dma_200: 0.05,
                is_above_dma: false,
              },
            },
            {
              ...baseSnapshot,
              snapshot_date: '2025-01-02',
              eth_btc_relative_strength: {
                ratio: 0.06,
                dma_200: 0.05,
                is_above_dma: true,
              },
            },
          ],
          count: 2,
          token_symbol: 'btc',
          days_requested: 1900,
          timestamp: '2025-01-02T00:00:00Z',
        },
        isLoading: false,
        isSuccess: true,
        status: 'success',
      }),
    );

    const { container } = render(<RelativeStrengthSection />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const dots = container.querySelectorAll("[data-testid='reference-dot']");
      expect(dots.length).toBeGreaterThan(0);
    });
  });

  it('renders without crosspoints when is_above_dma is stable across snapshots', async () => {
    mockUseMarketDashboardQuery.mockReturnValue(
      makeQueryResult({
        data: {
          snapshots: [
            {
              ...baseSnapshot,
              snapshot_date: '2025-01-01',
              eth_btc_relative_strength: {
                ratio: 0.05,
                dma_200: 0.04,
                is_above_dma: true,
              },
            },
            {
              ...baseSnapshot,
              snapshot_date: '2025-01-02',
              eth_btc_relative_strength: {
                ratio: 0.055,
                dma_200: 0.041,
                is_above_dma: true,
              },
            },
          ],
          count: 2,
          token_symbol: 'btc',
          days_requested: 1900,
          timestamp: '2025-01-02T00:00:00Z',
        },
        isLoading: false,
        isSuccess: true,
        status: 'success',
      }),
    );

    const { container } = render(<RelativeStrengthSection />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getAllByText('ETH leading').length).toBeGreaterThan(0);
    });
    expect(
      container.querySelectorAll("[data-testid='reference-dot']"),
    ).toHaveLength(0);
  });

  it('renders Insufficient data when data is undefined (no snapshots)', () => {
    mockUseMarketDashboardQuery.mockReturnValue(
      makeQueryResult({
        data: undefined,
        isLoading: false,
      }),
    );

    render(<RelativeStrengthSection />, { wrapper: createWrapper() });

    expect(screen.getAllByText('Insufficient data').length).toBeGreaterThan(0);
  });
});
