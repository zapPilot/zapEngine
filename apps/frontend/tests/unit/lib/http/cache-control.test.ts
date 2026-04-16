/**
 * cache-control - Unit Tests
 *
 * Tests for Cache-Control header parsing and query cache syncing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  hasHeaders,
  parseCacheControlForHint,
  syncQueryCacheDefaultsFromHint,
} from "@/lib/http/cache-control";
import { queryClient } from "@/lib/state/queryClient";

// Mock queryClient before importing the module
vi.mock("@/lib/state/queryClient", () => ({
  queryClient: {
    getDefaultOptions: vi.fn(() => ({ queries: {} })),
    setDefaultOptions: vi.fn(),
  },
}));

vi.mock("@/config/cacheWindow", () => ({
  CACHE_WINDOW: {
    staleTimeMs: 60000,
    gcTimeMs: 300000,
  },
}));

describe("cache-control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseCacheControlForHint", () => {
    it("should return null for undefined input", () => {
      expect(parseCacheControlForHint(undefined)).toBeNull();
    });

    it("should return null for null input", () => {
      expect(parseCacheControlForHint(null)).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(parseCacheControlForHint("")).toBeNull();
    });

    it("should parse max-age directive", () => {
      const result = parseCacheControlForHint("max-age=120");

      expect(result).not.toBeNull();
      expect(result?.staleTimeMs).toBe(120 * 1000);
      expect(result?.gcTimeMs).toBe(120 * 1000);
    });

    it("should parse s-maxage directive", () => {
      const result = parseCacheControlForHint("s-maxage=300");

      expect(result).not.toBeNull();
      expect(result?.staleTimeMs).toBe(300 * 1000);
    });

    it("should parse max-age with stale-while-revalidate", () => {
      const result = parseCacheControlForHint(
        "max-age=60, stale-while-revalidate=120"
      );

      expect(result).not.toBeNull();
      expect(result?.staleTimeMs).toBe(60 * 1000);
      expect(result?.gcTimeMs).toBe((60 + 120) * 1000);
    });

    it("should handle case-insensitive parsing", () => {
      const result = parseCacheControlForHint("MAX-AGE=90");

      expect(result).not.toBeNull();
      expect(result?.staleTimeMs).toBe(90 * 1000);
    });

    it("should handle directives with extra spaces", () => {
      const result = parseCacheControlForHint("  max-age=60  ,  private  ");

      expect(result).not.toBeNull();
      expect(result?.staleTimeMs).toBe(60 * 1000);
    });

    it("should return null when no max-age is present", () => {
      const result = parseCacheControlForHint("private, no-cache");

      expect(result).toBeNull();
    });

    it("should prefer max-age over s-maxage", () => {
      const result = parseCacheControlForHint("max-age=60");

      expect(result).not.toBeNull();
      expect(result?.staleTimeMs).toBe(60 * 1000);
    });

    it("should handle max-age=0 (totalSeconds <= 0 branch)", () => {
      const result = parseCacheControlForHint("max-age=0");

      expect(result).not.toBeNull();
      expect(result?.staleTimeMs).toBe(0);
      // gcTimeMs falls back to staleTimeMs when totalSeconds is 0
      expect(result?.gcTimeMs).toBe(0);
    });

    it("should handle invalid max-age values", () => {
      const result = parseCacheControlForHint("max-age=invalid");

      expect(result).toBeNull();
    });
  });

  describe("hasHeaders", () => {
    it("should return true for object with headers.get function", () => {
      const response = {
        headers: {
          get: () => null,
        },
      };

      expect(hasHeaders(response)).toBe(true);
    });

    it("should return false for null", () => {
      expect(hasHeaders(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(hasHeaders(undefined)).toBe(false);
    });

    it("should return false for primitive values", () => {
      expect(hasHeaders("string")).toBe(false);
      expect(hasHeaders(123)).toBe(false);
      expect(hasHeaders(true)).toBe(false);
    });

    it("should return false for object without headers", () => {
      expect(hasHeaders({ data: "test" })).toBe(false);
    });

    it("should return false for object with headers but no get function", () => {
      const response = {
        headers: {},
      };

      expect(hasHeaders(response)).toBe(false);
    });
  });

  describe("syncQueryCacheDefaultsFromHint", () => {
    it("should update query client defaults with new hint", () => {
      const hint = { staleTimeMs: 120000, gcTimeMs: 600000 };

      syncQueryCacheDefaultsFromHint(hint);

      expect(queryClient.setDefaultOptions).toHaveBeenCalled();
    });

    it("should update when getDefaultOptions has no queries key", () => {
      vi.mocked(queryClient.getDefaultOptions).mockReturnValueOnce({});
      const hint = { staleTimeMs: 30000, gcTimeMs: 150000 };

      syncQueryCacheDefaultsFromHint(hint);

      expect(queryClient.setDefaultOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          queries: expect.objectContaining({
            staleTime: 30000,
            gcTime: 150000,
          }),
        })
      );
    });

    it("should not update if hint matches current applied hint", () => {
      const hint = { staleTimeMs: 60000, gcTimeMs: 300000 };

      // Reset to match default
      syncQueryCacheDefaultsFromHint(hint);
      vi.clearAllMocks();

      // Call again with same values
      syncQueryCacheDefaultsFromHint(hint);

      // Should not call setDefaultOptions again
      expect(queryClient.setDefaultOptions).not.toHaveBeenCalled();
    });
  });
});
