import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalErrorHandler } from "@/components/errors/GlobalErrorHandler";

// Polyfill PromiseRejectionEvent
class MockPromiseRejectionEvent extends Event {
  promise: Promise<any>;
  reason: any;
  constructor(type: string, options: { promise: Promise<any>; reason: any }) {
    super(type, { bubbles: true, cancelable: true });
    this.promise = options.promise;
    this.reason = options.reason;
  }
}
global.PromiseRejectionEvent = MockPromiseRejectionEvent as any;

// Mock logger
const { mockErrorLogger } = vi.hoisted(() => ({
  mockErrorLogger: vi.fn(),
}));

vi.mock("@/utils/logger", () => ({
  logger: {
    createContextLogger: () => ({
      error: mockErrorLogger,
    }),
  },
}));

describe("GlobalErrorHandler", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("registers event listeners on mount and removes them on unmount", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = render(<GlobalErrorHandler />);

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function)
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "error",
      expect.any(Function)
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function)
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "error",
      expect.any(Function)
    );
  });

  it("logs unhandled promise rejections", () => {
    render(<GlobalErrorHandler />);

    const error = new Error("Test Rejection");
    const event = new PromiseRejectionEvent("unhandledrejection", {
      promise: Promise.resolve(),
      reason: error,
    });

    // Prevent default to avoid console noise if not mocked fully
    vi.spyOn(event, "preventDefault");

    window.dispatchEvent(event);

    expect(mockErrorLogger).toHaveBeenCalledWith(
      "Unhandled Promise Rejection",
      expect.objectContaining({
        reason: error,
        stack: error.stack,
      })
    );
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("logs global errors", () => {
    render(<GlobalErrorHandler />);

    const error = new Error("Test Error");
    const event = new ErrorEvent("error", {
      message: "Test Error Message",
      filename: "test.js",
      lineno: 10,
      colno: 5,
      error,
    });

    window.dispatchEvent(event);

    expect(mockErrorLogger).toHaveBeenCalledWith(
      "Global Error",
      expect.objectContaining({
        message: "Test Error Message",
        filename: "test.js",
        lineno: 10,
        colno: 5,
        error,
      })
    );
  });
});
