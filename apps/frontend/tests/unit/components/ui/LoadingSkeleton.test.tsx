import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CardSkeleton,
  ChartSkeleton,
  MetricsSkeleton,
  Skeleton as LoadingSkeleton,
} from "@/components/ui/LoadingSystem";

describe("LoadingSkeleton", () => {
  describe("Basic Rendering", () => {
    it("should render with default props", () => {
      render(<LoadingSkeleton />);

      const skeleton = screen.getByTestId("loading-skeleton");
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveClass("animate-pulse");
    });

    it("should apply custom className", () => {
      render(<LoadingSkeleton className="custom-skeleton" />);

      const skeleton = screen.getByTestId("loading-skeleton");
      expect(skeleton).toHaveClass("custom-skeleton");
    });
  });

  describe("Variant Types", () => {
    it.each([
      ["text", ["h-4", "bg-gray-200", "rounded"]],
      ["circular", ["rounded-full"]],
      ["rectangular", ["rounded"]],
    ] as [string, string[]][])(
      "should render %s variant",
      (variant, expectedClasses) => {
        render(
          <LoadingSkeleton
            variant={variant as "text" | "circular" | "rectangular"}
          />
        );
        expect(screen.getByTestId("loading-skeleton")).toHaveClass(
          ...expectedClasses
        );
      }
    );
  });

  describe("Text Variant with Lines", () => {
    it("should render single line by default", () => {
      render(<LoadingSkeleton variant="text" />);

      const skeleton = screen.getByTestId("loading-skeleton");
      expect(skeleton).toHaveClass("bg-gray-200", "animate-pulse");
    });

    it("should render multiple lines", () => {
      render(<LoadingSkeleton variant="text" lines={3} />);

      const skeleton = screen.getByTestId("loading-skeleton");
      const lineElements = Array.from(skeleton.children).filter(
        child => child.tagName !== "SPAN"
      );

      expect(lineElements).toHaveLength(3);
    });

    it("should vary line widths for multiple lines", () => {
      render(<LoadingSkeleton variant="text" lines={4} />);

      const skeleton = screen.getByTestId("loading-skeleton");
      const lineElements = Array.from(skeleton.children).filter(
        child => child.tagName !== "SPAN"
      );

      // Implementation uses inline styles, not CSS classes
      expect(lineElements).toHaveLength(4);
      expect(lineElements[lineElements.length - 1]).toHaveStyle({
        width: "75%",
      });
    });
  });

  describe("Custom Dimensions", () => {
    it("should apply custom width and height", () => {
      render(
        <LoadingSkeleton variant="rectangular" width="200px" height="100px" />
      );

      const skeleton = screen.getByTestId("loading-skeleton");
      expect(skeleton).toHaveStyle({ width: "200px", height: "100px" });
    });

    it("should use default dimensions when not specified", () => {
      render(<LoadingSkeleton variant="circular" />);

      const skeleton = screen.getByTestId("loading-skeleton");
      expect(skeleton).toHaveClass(
        "rounded-full",
        "bg-gray-200",
        "animate-pulse"
      );
    });
  });
});

describe("CardSkeleton", () => {
  it("should render card skeleton structure", () => {
    render(<CardSkeleton />);

    const card = screen.getByTestId("card-skeleton");
    expect(card).toBeInTheDocument();
    expect(card).toHaveClass("p-6");

    // Check for animated skeleton elements inside
    const skeletonElements = card.querySelectorAll(".animate-pulse");
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  it("should apply custom className", () => {
    render(<CardSkeleton className="custom-card" />);

    const card = screen.getByTestId("card-skeleton");
    expect(card).toHaveClass("custom-card");
  });
});

describe("MetricsSkeleton", () => {
  it("should render metrics skeleton structure", () => {
    render(<MetricsSkeleton />);

    const metrics = screen.getByTestId("metrics-skeleton");
    expect(metrics).toBeInTheDocument();
    expect(metrics).toHaveClass(
      "grid",
      "grid-cols-1",
      "md:grid-cols-3",
      "gap-4"
    );

    // Check for animated skeleton elements inside
    const skeletonElements = metrics.querySelectorAll(".animate-pulse");
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  it("should apply custom className", () => {
    render(<MetricsSkeleton className="custom-metrics" />);

    const metrics = screen.getByTestId("metrics-skeleton");
    expect(metrics).toHaveClass("custom-metrics");
  });

  it("should render multiple metric cards", () => {
    render(<MetricsSkeleton />);

    const metrics = screen.getByTestId("metrics-skeleton");
    const metricCards = metrics.children;
    expect(metricCards.length).toBe(3); // Should have 3 metric cards
  });
});

describe("ChartSkeleton", () => {
  it("should render chart skeleton structure", () => {
    render(<ChartSkeleton />);

    const chart = screen.getByTestId("chart-skeleton");
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveClass("flex", "flex-col", "items-center");

    // Check for animated skeleton elements inside
    const skeletonElements = chart.querySelectorAll(".animate-pulse");
    expect(skeletonElements.length).toBeGreaterThan(0);
  });

  it("should apply custom className", () => {
    render(<ChartSkeleton className="custom-chart" />);

    const chart = screen.getByTestId("chart-skeleton");
    expect(chart).toHaveClass("custom-chart");
  });

  it("should have proper chart structure", () => {
    render(<ChartSkeleton />);

    const chart = screen.getByTestId("chart-skeleton");
    // Check for circular chart skeleton (200x200)
    const circularSkeleton = chart.querySelector(".rounded-full");
    expect(circularSkeleton).toBeInTheDocument();
  });
});
