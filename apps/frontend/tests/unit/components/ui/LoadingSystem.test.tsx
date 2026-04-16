/**
 * Unit tests for LoadingSystem components
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CardSkeleton,
  ChartSkeleton,
  LoadingState,
  MetricsSkeleton,
  Skeleton,
  Spinner,
} from "@/components/ui/LoadingSystem";

describe("LoadingSystem", () => {
  describe("Spinner", () => {
    it("should render default spinner", () => {
      render(<Spinner />);
      const spinner = screen.getByTestId("loading-spinner");
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveAttribute("data-size", "md");
      expect(spinner.querySelector("svg")).toHaveClass("animate-spin");
    });

    it("should render dots variant", () => {
      render(<Spinner variant="dots" />);
      const spinner = screen.getByTestId("loading-spinner");
      expect(spinner).toBeInTheDocument();
      expect(spinner.querySelectorAll("div.rounded-full")).toHaveLength(3);
    });

    it("should render pulse variant", () => {
      render(<Spinner variant="pulse" />);
      const spinner = screen.getByTestId("loading-spinner");
      expect(spinner).toBeInTheDocument();
      expect(spinner.querySelector("div.rounded-full")).toBeInTheDocument();
    });

    it("should apply size classes", () => {
      render(<Spinner size="lg" />);
      const spinner = screen.getByTestId("loading-spinner");
      expect(spinner).toHaveAttribute("data-size", "lg");
      expect(spinner).toHaveClass("w-8 h-8");
    });

    it("should hide from screen readers when configured", () => {
      render(<Spinner aria-hidden="true" />);
      const spinner = screen.getByTestId("loading-spinner");
      expect(spinner).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("Skeleton", () => {
    it("should render single line skeleton by default", () => {
      render(<Skeleton />);
      const skeleton = screen.getByTestId("loading-skeleton");
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute("data-variant", "rectangular");
    });

    it("should render multiple lines", () => {
      render(<Skeleton lines={3} />);
      const skeleton = screen.getByTestId("loading-skeleton");
      expect(skeleton).toHaveAttribute("data-lines", "3");
      expect(skeleton.children).toHaveLength(4); // 3 lines + screen reader text
    });

    it("should render different variants", () => {
      const { rerender } = render(<Skeleton variant="circular" />);
      expect(screen.getByTestId("loading-skeleton")).toHaveClass(
        "rounded-full"
      );

      rerender(<Skeleton variant="text" />);
      expect(screen.getByTestId("loading-skeleton")).toHaveClass("h-4 rounded");
    });

    it("should accept custom dimensions", () => {
      render(<Skeleton width={100} height={50} />);
      const skeleton = screen.getByTestId("loading-skeleton");
      expect(skeleton).toHaveStyle({ width: "100px", height: "50px" });
    });
  });

  describe("LoadingState", () => {
    it("should render spinner variant by default", () => {
      render(<LoadingState message="Loading data..." />);
      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
      expect(screen.getByText("Loading data...")).toBeInTheDocument();
    });

    it("should render card variant", () => {
      render(<LoadingState variant="card" message="Loading card..." />);
      expect(screen.getByTestId("loading-card")).toBeInTheDocument();
      expect(screen.getByText("Loading card...")).toBeInTheDocument();
    });

    it("should render inline variant", () => {
      render(<LoadingState variant="inline" message="Saving..." />);
      const container = screen.getByText("Saving...").parentElement;
      expect(container).toHaveClass("inline-flex");
      expect(screen.getByTestId("loading-spinner")).toBeInTheDocument();
    });

    it("should render skeleton variants", () => {
      const { rerender } = render(
        <LoadingState variant="skeleton" skeletonType="card" />
      );
      expect(screen.getByTestId("card-skeleton")).toBeInTheDocument();

      rerender(<LoadingState variant="skeleton" skeletonType="metrics" />);
      expect(screen.getByTestId("metrics-skeleton")).toBeInTheDocument();

      rerender(<LoadingState variant="skeleton" skeletonType="chart" />);
      expect(screen.getByTestId("chart-skeleton")).toBeInTheDocument();

      rerender(
        <LoadingState variant="skeleton" skeletonType="text" lines={2} />
      );
      const textSkeleton = screen.getByTestId("loading-skeleton");
      expect(textSkeleton).toHaveAttribute("data-variant", "text");
      expect(textSkeleton).toHaveAttribute("data-lines", "2");
    });
  });

  describe("Specialized Skeletons", () => {
    it("CardSkeleton should render content", () => {
      render(<CardSkeleton />);
      expect(screen.getByTestId("card-skeleton")).toBeInTheDocument();
    });

    it("MetricsSkeleton should render 3 items", () => {
      render(<MetricsSkeleton />);
      const metrics = screen.getByTestId("metrics-skeleton");
      expect(metrics.children).toHaveLength(3);
    });

    it("ChartSkeleton should render circular chart placeholder", () => {
      render(<ChartSkeleton />);
      const chart = screen.getByTestId("chart-skeleton");
      expect(chart).toBeInTheDocument();
      // Should contain legends
      expect(chart.querySelectorAll(".space-y-2 > div")).toHaveLength(4);
    });
  });
});
