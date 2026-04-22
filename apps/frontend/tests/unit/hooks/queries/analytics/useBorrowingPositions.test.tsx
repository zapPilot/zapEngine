import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useBorrowingPositions } from '@/hooks/queries/analytics/useBorrowingPositions';
import { getBorrowingPositions } from '@/services/analyticsService';
import { logger } from '@/utils/logger';

vi.mock('@/services/analyticsService');
vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockResponse = {
  positions: [
    {
      protocol_id: 'aave-v3',
      protocol_name: 'Aave V3',
      chain: 'ethereum',
      health_rate: 1.8,
      health_status: 'HEALTHY',
      collateral_usd: 5000,
      debt_usd: 2000,
      net_value_usd: 3000,
      collateral_tokens: [{ symbol: 'ETH', amount: 2.5, value_usd: 5000 }],
      debt_tokens: [{ symbol: 'USDC', amount: 2000, value_usd: 2000 }],
      updated_at: '2025-02-07T12:00:00Z',
    },
  ],
  total_collateral_usd: 5000,
  total_debt_usd: 2000,
  worst_health_rate: 1.8,
  last_updated: '2025-02-07T12:00:00Z',
};

const BORROWING_POSITIONS_CACHE_MS = 12 * 60 * 60 * 1000;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  Wrapper.displayName = 'BorrowingPositionsWrapper';

  return { Wrapper, queryClient };
};

describe('useBorrowingPositions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled by default when enabled is not passed', () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useBorrowingPositions('user-123'), { wrapper: Wrapper });

    expect(getBorrowingPositions).not.toHaveBeenCalled();
  });

  it('uses the empty query key path when userId is missing', () => {
    const { Wrapper, queryClient } = createWrapper();

    renderHook(() => useBorrowingPositions(undefined, true), {
      wrapper: Wrapper,
    });

    expect(getBorrowingPositions).not.toHaveBeenCalled();
    expect(queryClient.getQueryCache().findAll()[0]?.queryKey).toEqual([]);
  });

  it('fetches borrowing positions when enabled with a valid userId', async () => {
    vi.mocked(getBorrowingPositions).mockResolvedValue(mockResponse);
    const { Wrapper } = createWrapper();

    renderHook(() => useBorrowingPositions('user-123', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(getBorrowingPositions).toHaveBeenCalledWith('user-123');
    });
  });

  it('returns data on success', async () => {
    vi.mocked(getBorrowingPositions).mockResolvedValue(mockResponse);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useBorrowingPositions('user-123', true),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockResponse);
  });

  it('applies the expected cache and retry configuration', async () => {
    vi.mocked(getBorrowingPositions).mockResolvedValue(mockResponse);
    const { Wrapper, queryClient } = createWrapper();

    renderHook(() => useBorrowingPositions('user-123', true), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(getBorrowingPositions).toHaveBeenCalledWith('user-123');
    });

    const query = queryClient.getQueryCache().find({
      queryKey: ['portfolio', 'borrowing-positions', 'user-123'],
    });

    expect(query?.options.staleTime).toBe(BORROWING_POSITIONS_CACHE_MS);
    expect(query?.options.gcTime).toBe(BORROWING_POSITIONS_CACHE_MS * 2);
    expect(query?.options.retry).toBe(1);
  });

  it('logs the error and rethrows on failure', async () => {
    const mockError = new Error('API request failed');
    vi.mocked(getBorrowingPositions).mockRejectedValue(mockError);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(
      () => useBorrowingPositions('user-123', true),
      { wrapper: Wrapper },
    );

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to fetch borrowing positions',
        expect.objectContaining({
          error: 'API request failed',
        }),
      );
    });

    expect(result.current.failureCount).toBeGreaterThan(0);
  });

  it('does not refetch when enabled transitions from true to false', async () => {
    vi.mocked(getBorrowingPositions).mockResolvedValue(mockResponse);
    const { Wrapper } = createWrapper();

    const { rerender } = renderHook(
      ({ enabled }) => useBorrowingPositions('user-123', enabled),
      {
        wrapper: Wrapper,
        initialProps: { enabled: true },
      },
    );

    await waitFor(() => {
      expect(getBorrowingPositions).toHaveBeenCalledTimes(1);
    });

    vi.clearAllMocks();

    rerender({ enabled: false });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(getBorrowingPositions).not.toHaveBeenCalled();
  });
});
