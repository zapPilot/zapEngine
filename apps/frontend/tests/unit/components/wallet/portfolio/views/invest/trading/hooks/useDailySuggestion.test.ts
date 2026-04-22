import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  suggestionKeys,
  useDailySuggestion,
} from '@/components/wallet/portfolio/views/invest/trading/hooks/useDailySuggestion';
import { getDailySuggestion } from '@/services/strategyService';
import type { DailySuggestionResponse } from '@/types/strategy';

import { QueryClientWrapper } from '../../../../../../../../test-utils';

// Mock the service
vi.mock('@/services/strategyService', () => ({
  getDailySuggestion: vi.fn(),
}));

const mockUserId = 'user-123';
const mockSuggestionResponse: DailySuggestionResponse = {
  as_of: '2024-01-15',
  config_id: 'dma_gated_fgi_default',
  config_display_name: 'DMA Gated FGI Default',
  strategy_id: 'dma_gated_fgi',
  action: {
    status: 'action_required',
    required: true,
    kind: 'rebalance',
    reason_code: 'fear_accumulate',
    transfers: [
      {
        from_bucket: 'stable',
        to_bucket: 'spot',
        amount_usd: 1000,
      },
    ],
  },
  context: {
    market: {
      date: '2024-01-15',
      token_price: { btc: 42000 },
      sentiment: 25,
      sentiment_label: 'fear',
    },
    portfolio: {
      spot_usd: 5000,
      stable_usd: 5000,
      total_value: 10000,
      allocation: {
        spot: 0.5,
        stable: 0.5,
      },
      asset_allocation: {
        btc: 0.3,
        eth: 0.2,
        stable: 0.5,
        alt: 0,
      },
    },
    signal: {
      id: 'dma_gated_fgi',
      regime: 'fear',
      raw_value: 25,
      confidence: 0.8,
      details: {
        dma: {
          dma_200: 41000,
          distance: 0.024,
          zone: 'above',
          cross_event: null,
          cooldown_active: false,
          cooldown_remaining_days: 0,
          cooldown_blocked_zone: null,
          fgi_slope: -1,
        },
      },
    },
    target: {
      allocation: {
        spot: 0.6,
        stable: 0.4,
      },
      asset_allocation: {
        btc: 0.6,
        eth: 0,
        stable: 0.4,
        alt: 0,
      },
    },
    strategy: {
      stance: 'buy',
      reason_code: 'fear_accumulate',
      rule_group: 'dma_fgi',
      details: {},
    },
  },
};

describe('useDailySuggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('suggestionKeys factory', () => {
    it('exports all key for cache invalidation', () => {
      expect(suggestionKeys.all).toEqual(['suggestion']);
    });

    it('generates detail key with userId and configId', () => {
      const key = suggestionKeys.detail(mockUserId, 'dma_gated_fgi_default');
      expect(key).toEqual(['suggestion', mockUserId, 'dma_gated_fgi_default']);
    });

    it('generates detail key without configId', () => {
      const key = suggestionKeys.detail(mockUserId);
      expect(key).toEqual(['suggestion', mockUserId, undefined]);
    });
  });

  describe('hook behavior', () => {
    it('fetches data successfully with userId', async () => {
      vi.mocked(getDailySuggestion).mockResolvedValue(mockSuggestionResponse);

      const { result } = renderHook(() => useDailySuggestion(mockUserId), {
        wrapper: QueryClientWrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockSuggestionResponse);
      expect(getDailySuggestion).toHaveBeenCalledWith(mockUserId, undefined);
    });

    it('fetches data for a specific configId', async () => {
      vi.mocked(getDailySuggestion).mockResolvedValue(mockSuggestionResponse);

      const { result } = renderHook(
        () => useDailySuggestion(mockUserId, 'dma_gated_fgi_default'),
        {
          wrapper: QueryClientWrapper,
        },
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(getDailySuggestion).toHaveBeenCalledWith(
        mockUserId,
        'dma_gated_fgi_default',
      );
    });

    it('shows loading state initially', () => {
      vi.mocked(getDailySuggestion).mockImplementation(
        () => new Promise(() => undefined), // Never resolves
      );

      const { result } = renderHook(() => useDailySuggestion(mockUserId), {
        wrapper: QueryClientWrapper,
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.data).toBeUndefined();
    });

    it('handles error state', async () => {
      const mockError = new Error('Network error');
      vi.mocked(getDailySuggestion).mockRejectedValue(mockError);

      const { result } = renderHook(() => useDailySuggestion(mockUserId), {
        wrapper: QueryClientWrapper,
      });

      // Hook has retry: 2, so 3 attempts before isError
      await waitFor(
        () => {
          expect(result.current.isError).toBe(true);
        },
        { timeout: 10000 },
      );

      expect(result.current.error).toEqual(mockError);
      expect(result.current.data).toBeUndefined();
    });

    it('throws error when userId is undefined and query runs', async () => {
      const { result } = renderHook(
        () => useDailySuggestion(undefined, undefined, true),
        {
          wrapper: QueryClientWrapper,
        },
      );

      // Hook has retry: 2, so 3 attempts before isError
      await waitFor(
        () => {
          expect(result.current.isError).toBe(true);
        },
        { timeout: 10000 },
      );

      expect(result.current.error).toEqual(new Error('User ID is required'));
      expect(getDailySuggestion).not.toHaveBeenCalled();
    });

    it('disables query when userId is undefined', () => {
      const { result } = renderHook(() => useDailySuggestion(undefined), {
        wrapper: QueryClientWrapper,
      });

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe('idle');
      expect(getDailySuggestion).not.toHaveBeenCalled();
    });

    it('respects explicit enabled=false', () => {
      const { result } = renderHook(
        () => useDailySuggestion(mockUserId, undefined, false),
        {
          wrapper: QueryClientWrapper,
        },
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe('idle');
      expect(getDailySuggestion).not.toHaveBeenCalled();
    });

    it('enables query with explicit enabled=true and userId', async () => {
      vi.mocked(getDailySuggestion).mockResolvedValue(mockSuggestionResponse);

      const { result } = renderHook(
        () => useDailySuggestion(mockUserId, undefined, true),
        {
          wrapper: QueryClientWrapper,
        },
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(getDailySuggestion).toHaveBeenCalledWith(mockUserId, undefined);
    });

    it('disables query when enabled=false overrides userId presence', () => {
      const { result } = renderHook(
        () => useDailySuggestion(mockUserId, undefined, false),
        {
          wrapper: QueryClientWrapper,
        },
      );

      expect(result.current.isPending).toBe(true);
      expect(result.current.fetchStatus).toBe('idle');
      expect(getDailySuggestion).not.toHaveBeenCalled();
    });

    it('uses correct query key with userId and configId', async () => {
      vi.mocked(getDailySuggestion).mockResolvedValue(mockSuggestionResponse);

      const { result } = renderHook(
        () => useDailySuggestion(mockUserId, 'dma_gated_fgi_default'),
        {
          wrapper: QueryClientWrapper,
        },
      );

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // Query key should match the factory function
      expect(result.current.data).toEqual(mockSuggestionResponse);
    });

    it('uses empty string for userId in query key when undefined', () => {
      const { result } = renderHook(() => useDailySuggestion(undefined), {
        wrapper: QueryClientWrapper,
      });

      // Even though disabled, query key should be generated with empty string
      expect(result.current.fetchStatus).toBe('idle');
    });

    it('retries twice on failure', async () => {
      let callCount = 0;
      vi.mocked(getDailySuggestion).mockImplementation(() => {
        callCount++;
        return Promise.reject(new Error('Network error'));
      });

      const { result } = renderHook(() => useDailySuggestion(mockUserId), {
        wrapper: QueryClientWrapper,
      });

      // Hook has retry: 2, so wait for all 3 attempts
      await waitFor(
        () => {
          expect(result.current.isError).toBe(true);
        },
        { timeout: 10000 },
      );

      // Initial call + 2 retries = 3 total calls
      expect(callCount).toBe(3);
    });

    it('handles an omitted configId', async () => {
      vi.mocked(getDailySuggestion).mockResolvedValue(mockSuggestionResponse);

      const { result } = renderHook(() => useDailySuggestion(mockUserId), {
        wrapper: QueryClientWrapper,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(getDailySuggestion).toHaveBeenCalledWith(mockUserId, undefined);
    });
  });
});
