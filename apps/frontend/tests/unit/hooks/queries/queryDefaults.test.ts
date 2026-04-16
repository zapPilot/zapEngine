/**
 * Unit tests for queryDefaults - React Query configuration utilities
 */
import { describe, expect, it, vi } from "vitest";

import {
  createQueryConfig,
  logQueryError,
} from "@/hooks/queries/queryDefaults";
import { ServiceError } from "@/lib/errors";
import { APIError } from "@/lib/http";

vi.mock("@/utils", async importOriginal => {
  const original = await importOriginal<typeof import("@/utils")>();
  return {
    ...original,
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      getLogs: vi.fn(() => []),
    },
  };
});

describe("queryDefaults", () => {
  describe("logQueryError", () => {
    it("logs a plain Error with its message and undefined status", async () => {
      const { logger } = await import("@/utils");
      vi.clearAllMocks();

      logQueryError("Failed to fetch", new Error("timeout"));

      expect(logger.error).toHaveBeenCalledWith("Failed to fetch", {
        error: "timeout",
        status: undefined,
      });
    });

    it("logs an APIError with its message and numeric status", async () => {
      const { logger } = await import("@/utils");
      vi.clearAllMocks();

      logQueryError("API fail", new APIError("bad request", 400, "BAD_REQ"));

      expect(logger.error).toHaveBeenCalledWith("API fail", {
        error: "bad request",
        status: 400,
      });
    });

    it("logs a raw string error with String() coercion and undefined status", async () => {
      const { logger } = await import("@/utils");
      vi.clearAllMocks();

      logQueryError("Unknown", "raw string");

      expect(logger.error).toHaveBeenCalledWith("Unknown", {
        error: "raw string",
        status: undefined,
      });
    });
  });

  describe("createQueryConfig", () => {
    it("should return default configuration with etl timings", () => {
      const config = createQueryConfig();

      expect(config.staleTime).toBeDefined();
      expect(config.gcTime).toBeDefined();
      expect(typeof config.retry).toBe("function");
      expect(typeof config.retryDelay).toBe("function");
    });

    it("should use volatile timings for volatile dataType", () => {
      const config = createQueryConfig({ dataType: "volatile" });

      // Volatile has shorter times (5 minutes stale, 15 minutes gc)
      expect(config.staleTime).toBe(5 * 60 * 1000);
      expect(config.gcTime).toBe(15 * 60 * 1000);
    });

    it("should default to etl timings when no dataType is specified", () => {
      const config = createQueryConfig();

      // Default is etl timings
      expect(config.staleTime).toBeDefined();
      expect(config.gcTime).toBeDefined();
    });

    describe("retry logic", () => {
      it("should allow retry when failure count is below max", () => {
        const config = createQueryConfig({ retryConfig: { maxRetries: 3 } });
        const retry = config.retry as (
          failureCount: number,
          error: unknown
        ) => boolean;

        expect(retry(0, new Error("Server error"))).toBe(true);
        expect(retry(1, new Error("Server error"))).toBe(true);
        expect(retry(2, new Error("Server error"))).toBe(true);
        expect(retry(3, new Error("Server error"))).toBe(false);
      });

      it("should stop retry when failure count reaches max", () => {
        const config = createQueryConfig({ retryConfig: { maxRetries: 2 } });
        const retry = config.retry as (
          failureCount: number,
          error: unknown
        ) => boolean;

        expect(retry(2, new Error("Error"))).toBe(false);
        expect(retry(3, new Error("Error"))).toBe(false);
      });

      it("should skip retry for client errors (4xx) by default", () => {
        const config = createQueryConfig();
        const retry = config.retry as (
          failureCount: number,
          error: unknown
        ) => boolean;

        // Create a mock object with status property
        const clientError = { status: 404, message: "Not found" };

        expect(retry(0, clientError)).toBe(false);
      });

      it("should skip retry for ServiceError client errors", () => {
        const config = createQueryConfig();
        const retry = config.retry as (
          failureCount: number,
          error: unknown
        ) => boolean;

        // Create ServiceError with 4xx status (client error)
        const clientError = new ServiceError("Client error", 404, "NOT_FOUND");

        expect(retry(0, clientError)).toBe(false);
      });

      it("should allow retry for non-client errors even with skipClientErrors", () => {
        const config = createQueryConfig({
          retryConfig: { skipClientErrors: true },
        });
        const retry = config.retry as (
          failureCount: number,
          error: unknown
        ) => boolean;

        // 5xx errors should retry
        const serverError = { status: 500, message: "Server error" };
        expect(retry(0, serverError)).toBe(true);
      });

      it("should skip retry for errors with matching messages", () => {
        const config = createQueryConfig({
          retryConfig: {
            skipErrorMessages: ["USER_NOT_FOUND", "INVALID_TOKEN"],
          },
        });
        const retry = config.retry as (
          failureCount: number,
          error: unknown
        ) => boolean;

        expect(retry(0, new Error("USER_NOT_FOUND"))).toBe(false);
        expect(retry(0, new Error("Contains INVALID_TOKEN in message"))).toBe(
          false
        );
        expect(retry(0, new Error("Some other error"))).toBe(true);
      });

      it("should use customRetry when provided", () => {
        const customRetry = vi.fn().mockReturnValue(true);
        const config = createQueryConfig({
          retryConfig: { customRetry },
        });
        const retry = config.retry as (
          failureCount: number,
          error: unknown
        ) => boolean;

        const error = new Error("Test");
        const result = retry(5, error);

        expect(customRetry).toHaveBeenCalledWith(5, error);
        expect(result).toBe(true);
      });

      it("should prioritize customRetry over other retry logic", () => {
        // customRetry returns true even for client errors that would normally skip
        const customRetry = vi.fn().mockReturnValue(true);
        const config = createQueryConfig({
          retryConfig: {
            customRetry,
            skipClientErrors: true,
          },
        });
        const retry = config.retry as (
          failureCount: number,
          error: unknown
        ) => boolean;

        const clientError = { status: 400, message: "Bad request" };
        expect(retry(0, clientError)).toBe(true);
        expect(customRetry).toHaveBeenCalled();
      });
    });

    describe("retryDelay", () => {
      it("should use exponential backoff", () => {
        const config = createQueryConfig();
        const retryDelay = config.retryDelay as (
          attemptIndex: number
        ) => number;

        expect(retryDelay(0)).toBe(1500); // 1500 * 2^0 = 1500
        expect(retryDelay(1)).toBe(3000); // 1500 * 2^1 = 3000
        expect(retryDelay(2)).toBe(6000); // 1500 * 2^2 = 6000
      });

      it("should cap delay at 30 seconds", () => {
        const config = createQueryConfig();
        const retryDelay = config.retryDelay as (
          attemptIndex: number
        ) => number;

        // At attempt 5, 1500 * 2^5 = 48000, should cap at 30000
        expect(retryDelay(5)).toBe(30000);
        expect(retryDelay(10)).toBe(30000);
      });
    });
  });
});
