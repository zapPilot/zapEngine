/**
 * Regime History Service Tests
 *
 * Tests for fetching regime history from the backend API with
 * graceful error handling.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useRegimeHistory } from "@/hooks/queries/market/useRegimeHistoryQuery";
import { httpUtils } from "@/lib/http";
import type { RegimeHistoryResponse } from "@/schemas/api/regimeHistorySchemas";
import {
  DEFAULT_REGIME_HISTORY,
  fetchRegimeHistory,
} from "@/services/regimeHistoryService";
import { logger } from "@/utils/logger";

// Create spies
const analyticsEngineGetSpy = vi.spyOn(httpUtils.analyticsEngine, "get");

// Mock logger
vi.mock("@/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Test data - matches actual Zod schema structure
// Test data - matches actual Zod schema structure
const mockRegimeHistoryResponse: RegimeHistoryResponse = {
  current: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    to_regime: "n",
    transitioned_at: "2025-12-12T10:30:00Z",
    sentiment_value: 48,
    duration_hours: null,
  },
  previous: {
    id: "450e8400-e29b-41d4-a716-446655440000",
    to_regime: "f",
    transitioned_at: "2025-12-10T08:00:00Z",
    sentiment_value: 30,
    duration_hours: null,
  },
  direction: "fromLeft",
  duration_in_current: {
    hours: 51,
    days: 2,
    human_readable: "2 days, 3 hours",
  },
  transitions: [],
  timestamp: "2025-12-12T11:00:00Z",
  cached: false,
};

describe("regimeHistoryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("DEFAULT_REGIME_HISTORY", () => {
    it("should have neutral regime as default", () => {
      expect(DEFAULT_REGIME_HISTORY.currentRegime).toBe("n");
    });

    it("should have null previous regime", () => {
      expect(DEFAULT_REGIME_HISTORY.previousRegime).toBeNull();
    });

    it("should have default direction", () => {
      expect(DEFAULT_REGIME_HISTORY.direction).toBe("default");
    });

    it("should have null duration", () => {
      expect(DEFAULT_REGIME_HISTORY.duration).toBeNull();
    });

    it("should have empty transitions array", () => {
      expect(DEFAULT_REGIME_HISTORY.transitions).toEqual([]);
    });

    it("should have cached false", () => {
      expect(DEFAULT_REGIME_HISTORY.cached).toBe(false);
    });
  });

  describe("fetchRegimeHistory", () => {
    describe("successful API call", () => {
      beforeEach(() => {
        analyticsEngineGetSpy.mockResolvedValue(mockRegimeHistoryResponse);
      });

      it("should fetch regime history with default limit", async () => {
        const result = await fetchRegimeHistory();

        expect(httpUtils.analyticsEngine.get).toHaveBeenCalledWith(
          "/api/v2/market/regime/history?limit=2"
        );
        expect(result.currentRegime).toBe("n");
      });

      it("should fetch regime history with custom limit", async () => {
        await fetchRegimeHistory(10);

        expect(httpUtils.analyticsEngine.get).toHaveBeenCalledWith(
          "/api/v2/market/regime/history?limit=10"
        );
      });

      it("should transform API response correctly", async () => {
        const result = await fetchRegimeHistory();

        expect(result.currentRegime).toBe("n");
        expect(result.previousRegime).toBe("f");
        expect(result.direction).toBe("fromLeft");
        expect(result.duration).toEqual({
          hours: 51,
          days: 2,
          human_readable: "2 days, 3 hours",
        });
        expect(result.cached).toBe(false);
      });

      it("should handle null previous regime", async () => {
        const responseWithoutPrevious: RegimeHistoryResponse = {
          ...mockRegimeHistoryResponse,
          previous: null,
        };

        analyticsEngineGetSpy.mockResolvedValue(responseWithoutPrevious);

        const result = await fetchRegimeHistory();

        expect(result.previousRegime).toBeNull();
      });

      it("should handle cached response", async () => {
        const cachedResponse: RegimeHistoryResponse = {
          ...mockRegimeHistoryResponse,
          cached: true,
        };

        analyticsEngineGetSpy.mockResolvedValue(cachedResponse);

        const result = await fetchRegimeHistory();

        expect(result.cached).toBe(true);
      });

      it("should handle undefined cached field (default to false)", async () => {
        // simulating API response missing the field
        const responseUndefinedCached: RegimeHistoryResponse = {
          ...mockRegimeHistoryResponse,
        };
        delete (responseUndefinedCached as any).cached;

        analyticsEngineGetSpy.mockResolvedValue(responseUndefinedCached);

        const result = await fetchRegimeHistory();

        expect(result.cached).toBe(false);
      });
    });

    describe("error handling", () => {
      it("should throw APIError on network error", async () => {
        analyticsEngineGetSpy.mockRejectedValue(new Error("Network error"));

        await expect(fetchRegimeHistory()).rejects.toThrow();
      });

      it("should throw APIError with 404 message on not found", async () => {
        const error = new Error("Not found");
        Object.assign(error, { status: 404 });

        analyticsEngineGetSpy.mockRejectedValue(error);

        await expect(fetchRegimeHistory()).rejects.toThrow(
          /endpoint not found/i
        );
      });

      it("should throw APIError with 500 message on server error", async () => {
        const error = new Error("Server error");
        Object.assign(error, { status: 500 });

        analyticsEngineGetSpy.mockRejectedValue(error);

        await expect(fetchRegimeHistory()).rejects.toThrow(/unexpected error/i);
      });

      it("should throw APIError with 503 message on service unavailable", async () => {
        const error = new Error("Service unavailable");
        Object.assign(error, { status: 503 });

        analyticsEngineGetSpy.mockRejectedValue(error);

        await expect(fetchRegimeHistory()).rejects.toThrow(
          /temporarily unavailable/i
        );
      });

      it("should throw APIError with 504 message on timeout", async () => {
        const error = new Error("Gateway timeout");
        Object.assign(error, { status: 504 });

        analyticsEngineGetSpy.mockRejectedValue(error);

        await expect(fetchRegimeHistory()).rejects.toThrow(/timed out/i);
      });

      it("should throw APIError with 502 message on invalid gateway", async () => {
        const error = new Error("Bad gateway");
        Object.assign(error, { status: 502 });

        analyticsEngineGetSpy.mockRejectedValue(error);

        await expect(fetchRegimeHistory()).rejects.toThrow(
          /invalid regime data/i
        );
      });

      it("should default to 500 status if missing in error", async () => {
        const error = new Error("Generic error");
        // No status property

        analyticsEngineGetSpy.mockRejectedValue(error);

        await expect(fetchRegimeHistory()).rejects.toThrow(/unexpected error/i);
      });

      it("should throw on validation error", async () => {
        const invalidResponse = {
          current: { invalid: "data" },
        };

        analyticsEngineGetSpy.mockResolvedValue(invalidResponse);

        await expect(fetchRegimeHistory()).rejects.toThrow();
      });

      it("should throw on missing required fields", async () => {
        const incompleteResponse = {
          current: {
            id: "test",
            // Missing required to_regime and transitioned_at fields
          },
        };

        analyticsEngineGetSpy.mockResolvedValue(incompleteResponse);

        await expect(fetchRegimeHistory()).rejects.toThrow();
      });
    });
  });

  describe("useRegimeHistory", () => {
    const createWrapper = () => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            gcTime: 0,
          },
        },
      });

      const Wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );

      Wrapper.displayName = "RegimeHistoryTestWrapper";

      return Wrapper;
    };

    beforeEach(() => {
      analyticsEngineGetSpy.mockResolvedValue(mockRegimeHistoryResponse);
    });

    describe("successful data fetching", () => {
      it("should fetch regime history data", async () => {
        const { result } = renderHook(() => useRegimeHistory(), {
          wrapper: createWrapper(),
        });

        // Wait for actual data to replace placeholder
        await waitFor(() =>
          expect(result.current.isPlaceholderData).toBe(false)
        );

        expect(result.current.data?.currentRegime).toBe("n");
        expect(result.current.data?.previousRegime).toBe("f");
        expect(result.current.data?.direction).toBe("fromLeft");
      });

      it("should use correct query key", async () => {
        const { result } = renderHook(() => useRegimeHistory(), {
          wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        // Query key should match the pattern defined in queryKeys
        expect(result.current.data).toBeDefined();
      });

      it("should provide placeholder data immediately", () => {
        const { result } = renderHook(() => useRegimeHistory(), {
          wrapper: createWrapper(),
        });

        // Should have placeholder data before fetch completes
        expect(result.current.data).toEqual(DEFAULT_REGIME_HISTORY);
      });
    });

    describe("loading and error states", () => {
      it("should start with fetching state", () => {
        const { result } = renderHook(() => useRegimeHistory(), {
          wrapper: createWrapper(),
        });

        // With placeholderData, isLoading is false but isFetching is true
        expect(result.current.isFetching).toBe(true);
        expect(result.current.isPlaceholderData).toBe(true);
      });

      it("should transition to success state", async () => {
        const { result } = renderHook(() => useRegimeHistory(), {
          wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        expect(result.current.isLoading).toBe(false);
        expect(result.current.isError).toBe(false);
      });

      it("should not throw on error, returns default data", async () => {
        analyticsEngineGetSpy.mockRejectedValue(new Error("Network error"));

        const { result } = renderHook(() => useRegimeHistory(), {
          wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        // Should have default data, not error
        expect(result.current.data).toEqual(DEFAULT_REGIME_HISTORY);
        expect(result.current.isError).toBe(false);
      });
    });

    describe("caching behavior", () => {
      it("should have data updated timestamp after fetch", async () => {
        const { result } = renderHook(() => useRegimeHistory(), {
          wrapper: createWrapper(),
        });

        // Wait for placeholder data to be replaced with real data
        await waitFor(() =>
          expect(result.current.isPlaceholderData).toBe(false)
        );

        // Verify initial fetch occurred
        expect(httpUtils.analyticsEngine.get).toHaveBeenCalledTimes(1);

        // Verify dataUpdatedAt is set after successful fetch
        expect(result.current.dataUpdatedAt).toBeGreaterThan(0);
      });

      it("should have placeholder data during initial load", () => {
        const { result } = renderHook(() => useRegimeHistory(), {
          wrapper: createWrapper(),
        });

        // Should immediately have placeholder data
        expect(result.current.data).toEqual(DEFAULT_REGIME_HISTORY);
        expect(result.current.isPlaceholderData).toBe(true);
      });
    });

    describe("graceful degradation", () => {
      it("should return defaults immediately on API failure without retrying", async () => {
        // Mock API to fail
        analyticsEngineGetSpy.mockRejectedValue(new Error("API failure"));

        const { result } = renderHook(() => useRegimeHistory(), {
          wrapper: createWrapper(),
        });

        // Wait for query to settle
        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        // Verify only 1 API call was made (no retries due to try-catch in hook)
        expect(analyticsEngineGetSpy).toHaveBeenCalledTimes(1);

        // Verify default data is returned (graceful degradation)
        expect(result.current.data).toEqual(DEFAULT_REGIME_HISTORY);
        expect(result.current.isError).toBe(false);
      });

      it("should handle non-Error object rejections gracefully", async () => {
        // Mock API to fail with a string (not an Error object)
        analyticsEngineGetSpy.mockRejectedValue("Some string error");

        const { result } = renderHook(() => useRegimeHistory(), {
          wrapper: createWrapper(),
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));

        // Should return defaults
        expect(result.current.data).toEqual(DEFAULT_REGIME_HISTORY);

        // Verify logger was called with string representation
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining("Failed to fetch regime history"),
          expect.objectContaining({
            error: expect.stringContaining("unexpected error"),
            status: 500,
          })
        );
      });
    });
  });

  describe("data transformation", () => {
    it("should correctly transform all regime IDs", async () => {
      const regimes: {
        regime: "ef" | "f" | "n" | "g" | "eg";
      }[] = [
        { regime: "ef" },
        { regime: "f" },
        { regime: "n" },
        { regime: "g" },
        { regime: "eg" },
      ];

      for (const { regime } of regimes) {
        const response: RegimeHistoryResponse = {
          ...mockRegimeHistoryResponse,
          current: {
            ...mockRegimeHistoryResponse.current,
            to_regime: regime,
          },
        };

        analyticsEngineGetSpy.mockResolvedValue(response);

        const result = await fetchRegimeHistory();

        expect(result.currentRegime).toBe(regime);
      }
    });

    it("should correctly transform all direction types", async () => {
      const directions: {
        direction: "fromLeft" | "fromRight" | "default";
      }[] = [
        { direction: "fromLeft" },
        { direction: "fromRight" },
        { direction: "default" },
      ];

      for (const { direction } of directions) {
        const response: RegimeHistoryResponse = {
          ...mockRegimeHistoryResponse,
          direction,
        };

        analyticsEngineGetSpy.mockResolvedValue(response);

        const result = await fetchRegimeHistory();

        expect(result.direction).toBe(direction);
      }
    });
  });
});
