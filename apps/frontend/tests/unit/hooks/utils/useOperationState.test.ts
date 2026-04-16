/**
 * Unit tests for useOperationState hook
 *
 * Tests state management utilities for operations (loading, error states)
 */

import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { useOperationStateHandlers } from "@/hooks/utils/useOperationState";

interface OperationState {
  isLoading: boolean;
  error: string | null;
}

describe("useOperationStateHandlers", () => {
  it("should initialize with default state", () => {
    const { result } = renderHook(() => {
      const [state, setState] = useState<OperationState>({
        isLoading: false,
        error: null,
      });
      const handlers = useOperationStateHandlers(setState);
      return { state, handlers };
    });

    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.error).toBeNull();
  });

  it("should set loading state correctly", () => {
    const { result } = renderHook(() => {
      const [state, setState] = useState<OperationState>({
        isLoading: false,
        error: "Previous error",
      });
      const handlers = useOperationStateHandlers(setState);
      return { state, handlers };
    });

    act(() => {
      result.current.handlers.setLoading();
    });

    expect(result.current.state.isLoading).toBe(true);
    expect(result.current.state.error).toBeNull(); // Error should be cleared
  });

  it("should set success state correctly", () => {
    const { result } = renderHook(() => {
      const [state, setState] = useState<OperationState>({
        isLoading: true,
        error: null,
      });
      const handlers = useOperationStateHandlers(setState);
      return { state, handlers };
    });

    act(() => {
      result.current.handlers.setSuccess();
    });

    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.error).toBeNull();
  });

  it("should set error state correctly", () => {
    const { result } = renderHook(() => {
      const [state, setState] = useState<OperationState>({
        isLoading: true,
        error: null,
      });
      const handlers = useOperationStateHandlers(setState);
      return { state, handlers };
    });

    const errorMessage = "Network timeout";

    act(() => {
      result.current.handlers.setError(errorMessage);
    });

    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.error).toBe(errorMessage);
  });

  it("should handle state transitions in sequence", () => {
    const { result } = renderHook(() => {
      const [state, setState] = useState<OperationState>({
        isLoading: false,
        error: null,
      });
      const handlers = useOperationStateHandlers(setState);
      return { state, handlers };
    });

    // Start operation
    act(() => {
      result.current.handlers.setLoading();
    });
    expect(result.current.state.isLoading).toBe(true);
    expect(result.current.state.error).toBeNull();

    // Complete successfully
    act(() => {
      result.current.handlers.setSuccess();
    });
    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.error).toBeNull();
  });

  it("should handle error after loading", () => {
    const { result } = renderHook(() => {
      const [state, setState] = useState<OperationState>({
        isLoading: false,
        error: null,
      });
      const handlers = useOperationStateHandlers(setState);
      return { state, handlers };
    });

    // Start operation
    act(() => {
      result.current.handlers.setLoading();
    });
    expect(result.current.state.isLoading).toBe(true);

    // Operation fails
    act(() => {
      result.current.handlers.setError("API request failed");
    });
    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.error).toBe("API request failed");
  });

  it("should handle retry flow", () => {
    const { result } = renderHook(() => {
      const [state, setState] = useState<OperationState>({
        isLoading: false,
        error: "Previous failure",
      });
      const handlers = useOperationStateHandlers(setState);
      return { state, handlers };
    });

    expect(result.current.state.error).toBe("Previous failure");

    // Retry - should clear error and set loading
    act(() => {
      result.current.handlers.setLoading();
    });
    expect(result.current.state.isLoading).toBe(true);
    expect(result.current.state.error).toBeNull();

    // Success on retry
    act(() => {
      result.current.handlers.setSuccess();
    });
    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.error).toBeNull();
  });

  it("should maintain handler stability across renders", () => {
    const { result, rerender } = renderHook(() => {
      const [state, setState] = useState<OperationState>({
        isLoading: false,
        error: null,
      });
      const handlers = useOperationStateHandlers(setState);
      return { state, handlers };
    });

    const firstHandlers = result.current.handlers;

    // Trigger state change
    act(() => {
      result.current.handlers.setLoading();
    });

    rerender();

    const secondHandlers = result.current.handlers;

    // Handlers should be stable (same reference)
    expect(firstHandlers.setLoading).toBe(secondHandlers.setLoading);
    expect(firstHandlers.setSuccess).toBe(secondHandlers.setSuccess);
    expect(firstHandlers.setError).toBe(secondHandlers.setError);
  });

  it("should handle multiple error messages", () => {
    const { result } = renderHook(() => {
      const [state, setState] = useState<OperationState>({
        isLoading: false,
        error: null,
      });
      const handlers = useOperationStateHandlers(setState);
      return { state, handlers };
    });

    const errors = [
      "Connection timeout",
      "Invalid credentials",
      "Server error",
    ];

    for (const error of errors) {
      act(() => {
        result.current.handlers.setError(error);
      });
      expect(result.current.state.error).toBe(error);
      expect(result.current.state.isLoading).toBe(false);
    }
  });

  it("should clear error when setting loading state", () => {
    const { result } = renderHook(() => {
      const [state, setState] = useState<OperationState>({
        isLoading: false,
        error: "Previous error message",
      });
      const handlers = useOperationStateHandlers(setState);
      return { state, handlers };
    });

    expect(result.current.state.error).toBe("Previous error message");

    act(() => {
      result.current.handlers.setLoading();
    });

    expect(result.current.state.error).toBeNull();
    expect(result.current.state.isLoading).toBe(true);
  });
});
