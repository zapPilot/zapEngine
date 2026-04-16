/**
 * Unit tests for HTTP abort control utilities
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTimeoutController,
  isAbortError,
} from "@/lib/http/abort-control";

describe("abort-control", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createTimeoutController", () => {
    it("should create controller with signal and cleanup", () => {
      const { signal, cleanup } = createTimeoutController(1000);

      expect(signal).toBeInstanceOf(AbortSignal);
      expect(typeof cleanup).toBe("function");
      expect(signal.aborted).toBe(false);

      cleanup();
    });

    it("should abort after timeout", () => {
      const { signal, cleanup } = createTimeoutController(1000);

      expect(signal.aborted).toBe(false);

      vi.advanceTimersByTime(1000);

      expect(signal.aborted).toBe(true);

      cleanup();
    });

    it("should not abort before timeout", () => {
      const { signal, cleanup } = createTimeoutController(1000);

      vi.advanceTimersByTime(999);

      expect(signal.aborted).toBe(false);

      cleanup();
    });

    it("should cleanup timeout on cleanup call", () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      const { cleanup } = createTimeoutController(1000);

      cleanup();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it("should propagate external signal abort", () => {
      const externalController = new AbortController();
      const { signal, cleanup } = createTimeoutController(
        5000,
        externalController.signal
      );

      expect(signal.aborted).toBe(false);

      externalController.abort("User cancelled");

      expect(signal.aborted).toBe(true);

      cleanup();
    });

    it("should remove external signal listener on cleanup", () => {
      const externalController = new AbortController();
      const removeEventListenerSpy = vi.spyOn(
        externalController.signal,
        "removeEventListener"
      );

      const { cleanup } = createTimeoutController(
        5000,
        externalController.signal
      );

      cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        "abort",
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });
  });

  describe("isAbortError", () => {
    it("should return true for Error with name AbortError", () => {
      const error = new Error("Aborted");
      error.name = "AbortError";

      expect(isAbortError(error)).toBe(true);
    });

    it("should return true for DOMException with name AbortError", () => {
      const error = new DOMException("Aborted", "AbortError");

      expect(isAbortError(error)).toBe(true);
    });

    it("should return false for regular Error", () => {
      const error = new Error("Something went wrong");

      expect(isAbortError(error)).toBe(false);
    });

    it("should return false for non-Error objects", () => {
      expect(isAbortError(null)).toBe(false);
      expect(isAbortError(undefined)).toBe(false);
      expect(isAbortError("AbortError")).toBe(false);
      expect(isAbortError({ name: "AbortError" })).toBe(false);
    });

    it("should return false for Error with different name", () => {
      const error = new Error("Network error");
      error.name = "NetworkError";

      expect(isAbortError(error)).toBe(false);
    });
  });
});
