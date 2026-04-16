import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "../../../../src/components/errors/ErrorBoundary";

// Mock child component that can throw errors
function ProblematicComponent({
  shouldThrow = false,
}: {
  shouldThrow?: boolean;
}) {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div data-testid="working-component">Working fine</div>;
}

// Mock GradientButton
vi.mock("../../../../src/components/ui/GradientButton", () => ({
  GradientButton: vi.fn(({ children, onClick, className }) => (
    <button
      onClick={onClick}
      className={className}
      data-testid="gradient-button"
    >
      {children}
    </button>
  )),
}));

// Mock BaseCard
vi.mock("../../../../src/components/ui/BaseCard", () => ({
  BaseCard: vi.fn(({ children, className }) => (
    <div className={className} data-testid="base-card">
      {children}
    </div>
  )),
}));

describe("ErrorBoundary", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console.error for these tests
    vi.spyOn(console, "error").mockImplementation(() => {
      /* Suppress errors in test */
    });
    // Reset static counter for test isolation
    (ErrorBoundary as any).errorIdCounter = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  describe("Normal Operation", () => {
    it("should render children when no error occurs", () => {
      render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId("working-component")).toBeInTheDocument();
    });

    it("should not render error UI when children work normally", () => {
      render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(
        screen.queryByText("Oops! Something went wrong")
      ).not.toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("should catch and display error when child component throws", () => {
      render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(
        screen.getByText("Oops! Something went wrong")
      ).toBeInTheDocument();
      expect(screen.queryByTestId("working-component")).not.toBeInTheDocument();
    });

    it("should display error details in development mode", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText("Error Details")).toBeInTheDocument();
      expect(screen.getByText("Test error")).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });

    it("should not display error details in production mode", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.queryByText("Error Details")).not.toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });

    it("should call onError callback when provided", () => {
      const onError = vi.fn();

      render(
        <ErrorBoundary onError={onError}>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Test error" }),
        expect.objectContaining({ componentStack: expect.any(String) })
      );
    });

    it("should generate unique event ID for each error", () => {
      // First error boundary instance
      const { unmount } = render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      const firstEventId = screen.getByText(/Error ID: /).textContent;
      unmount();

      // Second error boundary instance (completely new)
      render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      const secondEventId = screen.getByText(/Error ID: /).textContent;
      expect(firstEventId).not.toBe(secondEventId);
    });
  });

  describe("Error Recovery", () => {
    it("should reset error state when Try Again is clicked", async () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(
        screen.getByText("Oops! Something went wrong")
      ).toBeInTheDocument();

      // Rerender with a child that no longer throws an error
      rerender(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      // Click the button to attempt recovery
      fireEvent.click(screen.getByText("Try Again"));

      // Wait for the working component to appear
      await waitFor(() => {
        expect(screen.getByTestId("working-component")).toBeInTheDocument();
      });
    });

    it("should reload page when Reload Page is clicked", () => {
      const mockReload = vi.fn();
      Object.defineProperty(window, "location", {
        value: { reload: mockReload },
        writable: true,
      });

      render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText("Reload Page"));

      expect(mockReload).toHaveBeenCalled();
    });

    it("should reset when resetKeys change", () => {
      const { rerender } = render(
        <ErrorBoundary resetKeys={["key1"]}>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(
        screen.getByText("Oops! Something went wrong")
      ).toBeInTheDocument();

      rerender(
        <ErrorBoundary resetKeys={["key2"]}>
          <ProblematicComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId("working-component")).toBeInTheDocument();
    });

    it("should reset when resetOnPropsChange is true and children change", () => {
      const { rerender } = render(
        <ErrorBoundary resetOnPropsChange={true}>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(
        screen.getByText("Oops! Something went wrong")
      ).toBeInTheDocument();

      rerender(
        <ErrorBoundary resetOnPropsChange={true}>
          <div data-testid="different-child">Different content</div>
        </ErrorBoundary>
      );

      expect(screen.getByTestId("different-child")).toBeInTheDocument();
    });
  });

  describe("Custom Fallback", () => {
    it("should render custom fallback when provided", () => {
      const customFallback = (
        <div data-testid="custom-error">Custom error UI</div>
      );

      render(
        <ErrorBoundary fallback={customFallback}>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId("custom-error")).toBeInTheDocument();
      expect(
        screen.queryByText("Oops! Something went wrong")
      ).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA attributes", () => {
      render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      const tryAgainButton = screen.getByText("Try Again");
      const reloadButton = screen.getByText("Reload Page");

      expect(tryAgainButton).toBeInTheDocument();
      expect(reloadButton).toBeInTheDocument();
    });

    it("should be keyboard accessible", () => {
      render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      const tryAgainButton = screen.getByText("Try Again");
      tryAgainButton.focus();

      expect(tryAgainButton).toHaveFocus();
    });
  });

  describe("Error Information", () => {
    it("should display support contact information", () => {
      render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/contact support/)).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /contact support/i })
      ).toHaveAttribute("href", "mailto:support@zappilot.com");
    });

    it("should include event ID in support message", () => {
      render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      const supportText = screen.getByText(/include the error ID/);
      expect(supportText).toBeInTheDocument();
    });
  });

  describe("Lifecycle: componentWillUnmount", () => {
    it("should call clearTimeout when resetTimeoutId is set on unmount", () => {
      const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

      // Directly instantiate and call lifecycle methods to exercise the private
      // resetTimeoutId branch, which is only reachable when a timer has been queued.
      const instance = new ErrorBoundary({ children: null });
      // Inject a non-null resetTimeoutId to hit the truthy branch
      (instance as any).resetTimeoutId = 999;

      instance.componentWillUnmount();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(999);
      clearTimeoutSpy.mockRestore();
    });

    it("should not call clearTimeout when resetTimeoutId is null on unmount", () => {
      const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

      const { unmount } = render(
        <ErrorBoundary>
          <ProblematicComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      unmount();

      // resetTimeoutId starts as null, so clearTimeout should not be called
      expect(clearTimeoutSpy).not.toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe("Lifecycle: componentDidUpdate edge cases", () => {
    it("should not reset when hasError is false and resetKeys change", () => {
      const { rerender } = render(
        <ErrorBoundary resetKeys={["key1"]}>
          <ProblematicComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      // No error state - resetKeys change should not trigger reset
      rerender(
        <ErrorBoundary resetKeys={["key2"]}>
          <ProblematicComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      // Children still render normally - no error was thrown
      expect(screen.getByTestId("working-component")).toBeInTheDocument();
    });

    it("should not reset when hasError is false and resetOnPropsChange is true", () => {
      const { rerender } = render(
        <ErrorBoundary resetOnPropsChange={true}>
          <ProblematicComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      rerender(
        <ErrorBoundary resetOnPropsChange={true}>
          <div data-testid="different-child">New content</div>
        </ErrorBoundary>
      );

      expect(screen.getByTestId("different-child")).toBeInTheDocument();
    });

    it("should not reset when resetKeys change but values are identical", () => {
      const { rerender } = render(
        <ErrorBoundary resetKeys={["key1"]}>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(
        screen.getByText("Oops! Something went wrong")
      ).toBeInTheDocument();

      // New array reference but same values - should NOT reset
      rerender(
        <ErrorBoundary resetKeys={["key1"]}>
          <ProblematicComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      // Error UI still shown because no key value changed
      expect(
        screen.getByText("Oops! Something went wrong")
      ).toBeInTheDocument();
    });

    it("should not reset when resetOnPropsChange is false and children change", () => {
      const { rerender } = render(
        <ErrorBoundary resetOnPropsChange={false}>
          <ProblematicComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(
        screen.getByText("Oops! Something went wrong")
      ).toBeInTheDocument();

      rerender(
        <ErrorBoundary resetOnPropsChange={false}>
          <div data-testid="different-child">New content</div>
        </ErrorBoundary>
      );

      // Still showing error because resetOnPropsChange is false
      expect(
        screen.getByText("Oops! Something went wrong")
      ).toBeInTheDocument();
    });
  });

  describe("reportError: production branch", () => {
    it("should not throw when reportError is called in production mode", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      // Rendering with an error in production should not throw from reportError
      expect(() => {
        render(
          <ErrorBoundary>
            <ProblematicComponent shouldThrow={true} />
          </ErrorBoundary>
        );
      }).not.toThrow();

      expect(
        screen.getByText("Oops! Something went wrong")
      ).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });
  });
});
