import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoadingState } from "../../../../src/components/ui/LoadingSystem";

// Mock child components - use importOriginal to preserve other exports
vi.mock("../../../../src/components/ui/LoadingSystem", async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    Spinner: vi.fn(({ size }) => (
      <div data-testid="loading-spinner" data-size={size}>
        Spinner
      </div>
    )),
    Skeleton: vi.fn(({ variant, lines }) => (
      <div
        data-testid="loading-skeleton"
        data-variant={variant}
        data-lines={lines}
      >
        Skeleton
      </div>
    )),
    CardSkeleton: vi.fn(() => (
      <div data-testid="card-skeleton">Card Skeleton</div>
    )),
    MetricsSkeleton: vi.fn(() => (
      <div data-testid="metrics-skeleton">Metrics Skeleton</div>
    )),
    ChartSkeleton: vi.fn(() => (
      <div data-testid="chart-skeleton">Chart Skeleton</div>
    )),
    LoadingCard: vi.fn(({ message, className }) => (
      <div data-testid="loading-card" className={className}>
        {message}
      </div>
    )),
  };
});

describe("LoadingState", () => {
  describe("Variant Rendering", () => {
    it("should render spinner variant by default", () => {
      render(<LoadingState />);

      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("should render card variant", () => {
      render(<LoadingState variant="card" message="Loading data" />);

      expect(screen.getByTestId("loading-card")).toBeInTheDocument();
      expect(screen.getByText("Loading data")).toBeInTheDocument();
    });

    it("should render skeleton variant with card type", () => {
      render(<LoadingState variant="skeleton" skeletonType="card" />);

      expect(screen.getByTestId("card-skeleton")).toBeInTheDocument();
    });

    it("should render skeleton variant with metrics type", () => {
      render(<LoadingState variant="skeleton" skeletonType="metrics" />);

      expect(screen.getByTestId("metrics-skeleton")).toBeInTheDocument();
    });

    it("should render skeleton variant with chart type", () => {
      render(<LoadingState variant="skeleton" skeletonType="chart" />);

      expect(screen.getByTestId("chart-skeleton")).toBeInTheDocument();
    });

    it("should render skeleton variant with text type", () => {
      render(<LoadingState variant="skeleton" skeletonType="text" lines={4} />);

      const skeleton = screen.getByTestId("loading-skeleton");
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute("data-variant", "text");
      expect(skeleton).toHaveAttribute("data-lines", "4");
    });

    it("should render inline variant", () => {
      render(<LoadingState variant="inline" message="Processing..." />);

      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
      expect(screen.getByText("Processing...")).toBeInTheDocument();
    });
  });

  describe("Props Handling", () => {
    it("should pass size prop to spinner", () => {
      render(<LoadingState variant="spinner" size="lg" />);

      const spinner = screen.getByTestId("loading-spinner");
      expect(spinner).toHaveAttribute("data-size", "lg");
    });

    it("should apply custom className", () => {
      render(<LoadingState variant="spinner" className="custom-loading" />);

      const container =
        screen.getByTestId("loading-spinner").parentElement?.parentElement;
      expect(container).toHaveClass("custom-loading");
    });

    it("should show custom message", () => {
      render(
        <LoadingState variant="spinner" message="Custom loading message" />
      );

      expect(screen.getByText("Custom loading message")).toBeInTheDocument();
    });

    it("should not show message when empty", () => {
      render(<LoadingState variant="spinner" message="" />);

      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  });

  describe("Default Fallback", () => {
    it("should render default spinner for unknown variant", () => {
      // @ts-expect-error - Testing invalid variant
      render(<LoadingState variant="unknown" />);

      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    });
  });
});

describe("LoadingState Integration", () => {
  it("should work with all variants in sequence", () => {
    const { rerender } = render(<LoadingState variant="spinner" />);
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();

    rerender(<LoadingState variant="card" />);
    expect(screen.getByTestId("loading-card")).toBeInTheDocument();

    rerender(<LoadingState variant="skeleton" skeletonType="metrics" />);
    expect(screen.getByTestId("metrics-skeleton")).toBeInTheDocument();

    rerender(<LoadingState variant="inline" />);
    expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
  });

  it("should maintain props across variants", () => {
    const { rerender } = render(
      <LoadingState
        variant="spinner"
        message="Test message"
        className="test-class"
      />
    );

    expect(screen.getByText("Test message")).toBeInTheDocument();

    rerender(
      <LoadingState
        variant="card"
        message="Test message"
        className="test-class"
      />
    );

    expect(screen.getByText("Test message")).toBeInTheDocument();
    expect(screen.getByTestId("loading-card")).toHaveClass("test-class");
  });
});
