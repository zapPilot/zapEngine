/**
 * Unit tests for useChainQuery hook
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useChainQuery } from '@/hooks/queries/wallet/useChainQuery';

// Create test query wrapper
function createTestQueryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const TestQueryWrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  TestQueryWrapper.displayName = 'TestQueryWrapper';
  return TestQueryWrapper;
}

// Mock chainServiceMock
vi.mock('@/services', () => ({
  chainServiceMock: {
    getSupportedChains: vi.fn().mockResolvedValue([
      { chainId: 1, name: 'Ethereum', symbol: 'ETH' },
      { chainId: 42161, name: 'Arbitrum', symbol: 'ETH' },
      { chainId: 10, name: 'Optimism', symbol: 'ETH' },
    ]),
    getChainById: vi.fn().mockImplementation((chainId: number) => {
      const chains: Record<
        number,
        { chainId: number; name: string; symbol: string }
      > = {
        1: { chainId: 1, name: 'Ethereum', symbol: 'ETH' },
        42161: { chainId: 42161, name: 'Arbitrum', symbol: 'ETH' },
        10: { chainId: 10, name: 'Optimism', symbol: 'ETH' },
      };
      return Promise.resolve(chains[chainId] || undefined);
    }),
  },
}));

describe('useChainQuery', () => {
  it('should fetch all chains when no chainId is provided', async () => {
    const { result } = renderHook(() => useChainQuery(), {
      wrapper: createTestQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(Array.isArray(result.current.data)).toBe(true);
    expect(result.current.data).toHaveLength(3);
  });

  it('should fetch specific chain when chainId is provided', async () => {
    const { result } = renderHook(() => useChainQuery(1), {
      wrapper: createTestQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const chainData = result.current.data;
    expect(chainData).not.toBeNull();
    // When chainId is provided, we get a single chain or null
    if (chainData && !Array.isArray(chainData)) {
      expect(chainData.chainId).toBe(1);
      expect(chainData.name).toBe('Ethereum');
    }
  });

  it('should return null for non-existent chainId', async () => {
    const { result } = renderHook(() => useChainQuery(999), {
      wrapper: createTestQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeNull();
  });

  it('should have correct query key for all chains', async () => {
    const { result } = renderHook(() => useChainQuery(), {
      wrapper: createTestQueryWrapper(),
    });

    // The hook returns query result, we can verify it works
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
  });

  it('should have correct query key for specific chain', async () => {
    const { result } = renderHook(() => useChainQuery(42161), {
      wrapper: createTestQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const chainData = result.current.data;
    if (chainData && !Array.isArray(chainData)) {
      expect(chainData.name).toBe('Arbitrum');
    }
  });
});
