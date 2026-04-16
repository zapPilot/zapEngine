/**
 * Unit tests for http-error-handler
 */
import { describe, expect, it } from "vitest";

import { APIError, NetworkError, TimeoutError } from "@/lib/http/errors";
import { handleHTTPError } from "@/lib/http/http-error-handler";

describe("handleHTTPError", () => {
  describe("APIError handling", () => {
    it("should return user-friendly message for USER_NOT_FOUND", () => {
      const error = new APIError("User not found", 404, "USER_NOT_FOUND");

      expect(handleHTTPError(error)).toBe(
        "User not found. Please connect your wallet first."
      );
    });

    it("should return user-friendly message for INVALID_ADDRESS", () => {
      const error = new APIError("Invalid address", 400, "INVALID_ADDRESS");

      expect(handleHTTPError(error)).toBe("Invalid wallet address provided.");
    });

    it("should return user-friendly message for RATE_LIMITED", () => {
      const error = new APIError("Rate limited", 429, "RATE_LIMITED");

      expect(handleHTTPError(error)).toBe(
        "Too many requests. Please try again later."
      );
    });

    it("should return original message for unknown error codes", () => {
      const error = new APIError("Custom error message", 500, "UNKNOWN_CODE");

      expect(handleHTTPError(error)).toBe("Custom error message");
    });

    it("should return message for APIError without code", () => {
      const error = new APIError("Generic API error", 500);

      expect(handleHTTPError(error)).toBe("Generic API error");
    });
  });

  describe("NetworkError handling", () => {
    it("should return network connection message", () => {
      const error = new NetworkError("Failed to fetch", "network_error");

      expect(handleHTTPError(error)).toBe(
        "Network connection failed. Please check your internet connection."
      );
    });
  });

  describe("TimeoutError handling", () => {
    it("should return timeout message", () => {
      const error = new TimeoutError(30000);

      expect(handleHTTPError(error)).toBe(
        "Request timed out. Please try again."
      );
    });
  });

  describe("Unknown error handling", () => {
    it("should return generic message for regular Error", () => {
      const error = new Error("Some error");

      expect(handleHTTPError(error)).toBe(
        "An unexpected error occurred. Please try again."
      );
    });

    it("should return generic message for non-Error objects", () => {
      expect(handleHTTPError("string error")).toBe(
        "An unexpected error occurred. Please try again."
      );
    });

    it("should return generic message for null", () => {
      expect(handleHTTPError(null)).toBe(
        "An unexpected error occurred. Please try again."
      );
    });
  });
});
