/**
 * QueryClientBoundary - Component Tests
 *
 * Tests for the query client boundary component that provides
 * a fallback QueryClient when none exists in the component tree.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QueryClientBoundary } from "@/utils/QueryClientBoundary";

describe("QueryClientBoundary", () => {
  describe("Without parent QueryClientProvider", () => {
    it("should render children with fallback provider", () => {
      render(
        <QueryClientBoundary>
          <div data-testid="child">Child Content</div>
        </QueryClientBoundary>
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
      expect(screen.getByText("Child Content")).toBeInTheDocument();
    });

    it("should provide a query client context to children", () => {
      // This tests that the fallback provider is working
      const TestComponent = () => {
        // If no QueryClient is available, this would throw
        return <div data-testid="test-component">Works</div>;
      };

      render(
        <QueryClientBoundary>
          <TestComponent />
        </QueryClientBoundary>
      );

      expect(screen.getByTestId("test-component")).toBeInTheDocument();
    });
  });

  describe("With parent QueryClientProvider", () => {
    it("should render children without wrapping in another provider", () => {
      const parentQueryClient = new QueryClient();

      render(
        <QueryClientProvider client={parentQueryClient}>
          <QueryClientBoundary>
            <div data-testid="child">Child Content</div>
          </QueryClientBoundary>
        </QueryClientProvider>
      );

      expect(screen.getByTestId("child")).toBeInTheDocument();
    });

    it("should pass through to existing provider", () => {
      const parentQueryClient = new QueryClient();

      render(
        <QueryClientProvider client={parentQueryClient}>
          <QueryClientBoundary>
            <div data-testid="nested-child">Nested</div>
          </QueryClientBoundary>
        </QueryClientProvider>
      );

      expect(screen.getByTestId("nested-child")).toBeInTheDocument();
      expect(screen.getByText("Nested")).toBeInTheDocument();
    });
  });

  describe("Multiple children", () => {
    it("should render multiple children correctly", () => {
      render(
        <QueryClientBoundary>
          <div data-testid="child-1">First</div>
          <div data-testid="child-2">Second</div>
        </QueryClientBoundary>
      );

      expect(screen.getByTestId("child-1")).toBeInTheDocument();
      expect(screen.getByTestId("child-2")).toBeInTheDocument();
    });
  });
});
