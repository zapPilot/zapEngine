import { describe, expect, it } from "vitest";

import { APIError } from "@/lib/http/errors";
import {
  calculateBackoffDelay,
  delay,
  shouldAttemptRetry,
} from "@/lib/http/retry";

describe("retry utils", () => {
  describe("shouldAttemptRetry", () => {
    it("should return false if attempts exceed retries", () => {
      expect(shouldAttemptRetry(3, 3, new Error("Retry limit hit"))).toBe(
        false
      );
      expect(shouldAttemptRetry(4, 3, new Error("Retry limit hit"))).toBe(
        false
      );
    });

    it("should return true for network errors within retry limit", () => {
      expect(shouldAttemptRetry(1, 3, new Error("Network error"))).toBe(true);
    });

    it("should return false for client errors (4xx)", () => {
      const error = new APIError("Bad Request", 400);
      expect(shouldAttemptRetry(1, 3, error)).toBe(false);
    });

    it("should return true for server errors (5xx)", () => {
      const error = new APIError("Server Error", 500);
      expect(shouldAttemptRetry(1, 3, error)).toBe(true);
      const gatewayTimeout = new APIError("Gateway Timeout", 504);
      expect(shouldAttemptRetry(1, 3, gatewayTimeout)).toBe(true);
    });

    it("should return true for non-API errors (e.g. standard Error)", () => {
      expect(shouldAttemptRetry(1, 3, new Error("Random crash"))).toBe(true);
    });
  });

  describe("calculateBackoffDelay", () => {
    it("should calculate exponential backoff", () => {
      const base = 1000;
      expect(calculateBackoffDelay(base, 0)).toBe(1000); // 1000 * 2^0
      expect(calculateBackoffDelay(base, 1)).toBe(2000); // 1000 * 2^1
      expect(calculateBackoffDelay(base, 2)).toBe(4000); // 1000 * 2^2
      expect(calculateBackoffDelay(base, 3)).toBe(8000);
    });
  });

  describe("delay", () => {
    it("should resolve after specified time", async () => {
      const start = Date.now();
      await delay(50);
      const end = Date.now();
      expect(end - start).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });
  });
});
