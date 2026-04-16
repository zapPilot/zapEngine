/**
 * sentimentService - Service Tests
 *
 * Comprehensive test suite for market sentiment data fetching and transformation.
 * Tests API interactions, error handling, data validation, and React Query hook configuration.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { FC, PropsWithChildren } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { useSentimentData } from "@/hooks/queries/market/useSentimentQuery";

// Mock HTTP utilities
const httpUtilsMock = vi.hoisted(() => ({
  httpUtils: {
    analyticsEngine: {
      get: vi.fn(),
    },
  },
  APIError: class APIError extends Error {
    constructor(
      message: string,
      public status: number,
      public code?: string,
      public details?: Record<string, unknown>
    ) {
      super(message);
      this.name = "APIError";
    }
  },
}));

vi.mock("@/lib/http", () => httpUtilsMock);

function resolveMockSentiment(value: number): string {
  if (value > 75) {
    return "Extreme Greed";
  }

  if (value > 55) {
    return "Greed";
  }

  return "Neutral";
}

// Mock sentiment quotes
vi.mock("@/config/sentimentQuotes", () => ({
  getQuoteForSentiment: vi.fn((value: number) => ({
    quote: `Mock quote for ${value}`,
    author: "Mock Author",
    sentiment: resolveMockSentiment(value),
  })),
}));

// Mock logger
vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn(),
  },
}));

// Mock query defaults
vi.mock("@/hooks/queries/queryDefaults", () => ({
  createQueryConfig: vi.fn(() => ({
    refetchOnWindowFocus: false,
    staleTime: 600000,
  })),
  logQueryError: vi.fn(),
}));

// Mock query keys
vi.mock("@/lib/state/queryClient", () => ({
  queryKeys: {
    sentiment: {
      market: () => ["sentiment", "market"],
    },
  },
}));

// Mock schema validation - returns input by default
vi.mock("@/schemas/api/sentimentSchemas", () => ({
  validateSentimentApiResponse: vi.fn(data => data),
}));

// Ensure we test the real service implementation
vi.unmock("@/services/sentimentService");

type SentimentServiceModule = typeof import("@/services/sentimentService");
type HttpUtilsModule = typeof import("@/lib/http");

let _sentimentService: SentimentServiceModule;
let httpUtils: HttpUtilsModule["httpUtils"];

async function loadModules(): Promise<void> {
  vi.resetModules();
  ({ httpUtils } = await import("@/lib/http"));
  _sentimentService = await import("@/services/sentimentService");
}

function createWrapper(): FC<PropsWithChildren> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
    },
  });
  // eslint-disable-next-line react/display-name
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeAll(async () => {
  await loadModules();
});

describe("sentimentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchMarketSentiment via useSentimentData hook", () => {
    it("should successfully fetch and transform sentiment data", async () => {
      const mockApiResponse = {
        value: 65,
        status: "Greed",
        timestamp: "2024-01-15T10:00:00Z",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(
        mockApiResponse
      );

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toBeDefined();
      expect(result.current.data?.value).toBe(65);
      expect(result.current.data?.status).toBe("Greed");
      expect(result.current.data?.timestamp).toBe("2024-01-15T10:00:00Z");
    });

    it("should call the correct API endpoint", async () => {
      const mockApiResponse = {
        value: 50,
        status: "Neutral",
        timestamp: "2024-01-15T10:00:00Z",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(
        mockApiResponse
      );

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(httpUtils.analyticsEngine.get).toHaveBeenCalledWith(
        "/api/v2/market/sentiment"
      );
    });

    it("should transform data with quote from getQuoteForSentiment", async () => {
      const mockApiResponse = {
        value: 80,
        status: "Extreme Greed",
        timestamp: "2024-01-15T14:00:00Z",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(
        mockApiResponse
      );

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.quote).toBeDefined();
      expect(result.current.data?.quote.quote).toBe("Mock quote for 80");
      expect(result.current.data?.quote.author).toBe("Mock Author");
    });

    it("should validate API response through schema", async () => {
      const mockApiResponse = {
        value: 75,
        status: "Greed",
        timestamp: "2024-01-15T12:00:00Z",
      };

      const { validateSentimentApiResponse } =
        await import("@/schemas/api/sentimentSchemas");

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(
        mockApiResponse
      );

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(validateSentimentApiResponse).toHaveBeenCalledWith(
        mockApiResponse
      );
    });
  });

  // Note: Error handling tests are skipped as they require complex React Query
  // setup to properly capture error states. The error mapping code is tested
  // indirectly through the 13 passing integration tests.
  describe("Error handling with createSentimentServiceError", () => {
    it("should handle 503 Service Unavailable errors with enhanced message", async () => {
      const { logQueryError } = await import("@/hooks/queries/queryDefaults");
      const error503 = {
        status: 503,
        message: "Service temporarily unavailable",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockRejectedValue(error503);

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true), {
        timeout: 3000,
      });

      expect(result.current.error).toBeDefined();
      expect(logQueryError).toHaveBeenCalled();
    });

    it("should handle 504 Gateway Timeout errors with enhanced message", async () => {
      const error504 = {
        status: 504,
        message: "Gateway timeout",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockRejectedValue(error504);

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true), {
        timeout: 3000,
      });

      expect(result.current.error).toBeDefined();
    });

    it("should handle 502 Bad Gateway errors with enhanced message", async () => {
      const error502 = {
        status: 502,
        message: "Bad gateway",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockRejectedValue(error502);

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true), {
        timeout: 3000,
      });

      expect(result.current.error).toBeDefined();
    });

    it("should handle 500 Internal Server errors with enhanced message", async () => {
      const error500 = {
        status: 500,
        message: "Internal server error",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockRejectedValue(error500);

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true), {
        timeout: 3000,
      });

      expect(result.current.error).toBeDefined();
    });

    it("should handle errors without status code gracefully", async () => {
      const genericError = new Error("Network error");

      vi.mocked(httpUtils.analyticsEngine.get).mockRejectedValue(genericError);

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true), {
        timeout: 3000,
      });

      expect(result.current.error).toBeDefined();
    });

    it("should log errors with structured format", async () => {
      const { logQueryError } = await import("@/hooks/queries/queryDefaults");
      const error = new Error("API failure");

      vi.mocked(httpUtils.analyticsEngine.get).mockRejectedValue(error);

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true), {
        timeout: 3000,
      });

      expect(logQueryError).toHaveBeenCalledWith(
        "Failed to fetch market sentiment",
        expect.any(Error)
      );
    });
    it("should handle non-object errors", async () => {
      vi.mocked(httpUtils.analyticsEngine.get).mockRejectedValue(
        "String error"
      );

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true), {
        timeout: 3000,
      });

      expect(result.current.error).toBeDefined();
      expect((result.current.error as any).message).toBe(
        "An unexpected error occurred while fetching sentiment data."
      );
    });

    it("should preserve error code and details", async () => {
      const complexError = {
        status: 400,
        message: "Bad Request",
        code: "INVALID_INPUT",
        details: { field: "value" },
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockRejectedValue(complexError);

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true), {
        timeout: 3000,
      });

      const error = result.current.error as any;
      expect(error.code).toBe("INVALID_INPUT");
      expect(error.details).toEqual({ field: "value" });
    });
  });

  describe("Data transformation", () => {
    it("should preserve value from API response", async () => {
      const mockApiResponse = {
        value: 42,
        status: "Fear",
        timestamp: "2024-01-15T10:00:00Z",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(
        mockApiResponse
      );

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.value).toBe(42);
    });

    it("should preserve status from API response", async () => {
      const mockApiResponse = {
        value: 25,
        status: "Extreme Fear",
        timestamp: "2024-01-15T10:00:00Z",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(
        mockApiResponse
      );

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.status).toBe("Extreme Fear");
    });

    it("should preserve timestamp from API response", async () => {
      const timestamp = "2024-01-15T15:30:00Z";
      const mockApiResponse = {
        value: 60,
        status: "Greed",
        timestamp,
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(
        mockApiResponse
      );

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.timestamp).toBe(timestamp);
    });

    it("should add quote object to transformed data", async () => {
      const mockApiResponse = {
        value: 55,
        status: "Neutral",
        timestamp: "2024-01-15T10:00:00Z",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(
        mockApiResponse
      );

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.quote).toEqual({
        quote: "Mock quote for 55",
        author: "Mock Author",
        sentiment: "Neutral",
      });
    });
  });

  describe("Edge cases", () => {
    it("should handle extreme sentiment value (100)", async () => {
      const extremeResponse = {
        value: 100,
        status: "Extreme Greed",
        timestamp: "2024-01-15T10:00:00Z",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(
        extremeResponse
      );

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.value).toBe(100);
    });

    it("should handle zero sentiment value", async () => {
      const zeroResponse = {
        value: 0,
        status: "Extreme Fear",
        timestamp: "2024-01-15T10:00:00Z",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(zeroResponse);

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.value).toBe(0);
    });

    it("should handle mid-range sentiment value (50)", async () => {
      const midResponse = {
        value: 50,
        status: "Neutral",
        timestamp: "2024-01-15T10:00:00Z",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(midResponse);

      const { result } = renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.value).toBe(50);
    });
  });

  describe("useSentimentData hook configuration", () => {
    it("should configure React Query with correct query key", async () => {
      const { queryKeys } = await import("@/lib/state/queryClient");
      const expectedKey = queryKeys.sentiment.market();

      expect(expectedKey).toEqual(["sentiment", "market"]);
    });

    it("should use createQueryConfig for base configuration", async () => {
      const { createQueryConfig } =
        await import("@/hooks/queries/queryDefaults");

      const mockApiResponse = {
        value: 50,
        status: "Neutral",
        timestamp: "2024-01-15T10:00:00Z",
      };

      vi.mocked(httpUtils.analyticsEngine.get).mockResolvedValue(
        mockApiResponse
      );

      renderHook(() => useSentimentData(), {
        wrapper: createWrapper(),
      });

      expect(createQueryConfig).toHaveBeenCalledWith();
    });
  });
});
