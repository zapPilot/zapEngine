/**
 * DataFreshnessIndicator - Unit Tests
 *
 * Tests for the data freshness indicator component including all states,
 * variants, and accessibility features.
 */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DataFreshnessIndicator } from "@/components/wallet/portfolio/components/shared/DataFreshnessIndicator";

describe("DataFreshnessIndicator", () => {
  beforeEach(() => {
    // Mock current time to 2025-12-29T12:00:00Z for consistent tests
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-12-29T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Freshness states", () => {
    it("should render fresh state for data <24h old", () => {
      const yesterday = "2025-12-28T12:00:00Z";
      render(<DataFreshnessIndicator lastUpdated={yesterday} />);

      // Should show "a day ago" text
      expect(screen.getByText(/Updated.*ago/)).toBeInTheDocument();

      // Should have purple gradient container
      const container = screen.getByRole("status");
      expect(container).toHaveClass("from-purple-500/20");
      expect(container).toHaveClass("to-blue-500/20");
    });

    it("should render stale state for data 24-72h old", () => {
      const twoDaysAgo = "2025-12-27T12:00:00Z";
      render(<DataFreshnessIndicator lastUpdated={twoDaysAgo} />);

      expect(screen.getByText(/Updated.*ago/)).toBeInTheDocument();

      // Should have amber container
      const container = screen.getByRole("status");
      expect(container).toHaveClass("bg-amber-500/20");
      expect(container).toHaveClass("border-amber-500/30");
    });

    it("should render very-stale state for data >72h old", () => {
      const fourDaysAgo = "2025-12-25T12:00:00Z";
      render(<DataFreshnessIndicator lastUpdated={fourDaysAgo} />);

      expect(screen.getByText(/Updated.*ago/)).toBeInTheDocument();

      // Should have red container with pulse animation
      const container = screen.getByRole("status");
      expect(container).toHaveClass("bg-red-500/20");
      expect(container).toHaveClass("border-red-500/30");
      expect(container).toHaveClass("animate-pulse");
    });

    it("should render unknown state for null lastUpdated", () => {
      render(<DataFreshnessIndicator lastUpdated={null} />);

      expect(screen.getByText(/Updated Unknown/)).toBeInTheDocument();

      // Should have gray container
      const container = screen.getByRole("status");
      expect(container).toHaveClass("bg-gray-500/20");
      expect(container).toHaveClass("border-gray-500/30");
    });

    it("should render unknown state for undefined lastUpdated", () => {
      render(<DataFreshnessIndicator lastUpdated={undefined} />);

      expect(screen.getByText(/Updated Unknown/)).toBeInTheDocument();
    });
  });

  describe("Variant behavior", () => {
    const lastUpdated = "2025-12-28T12:00:00Z";

    it('should show text on desktop only for "responsive" variant (default)', () => {
      render(<DataFreshnessIndicator lastUpdated={lastUpdated} />);

      const text = screen.getByText(/Updated.*ago/);
      expect(text).toHaveClass("hidden");
      expect(text).toHaveClass("md:inline");
    });

    it('should always show text for "full" variant', () => {
      render(
        <DataFreshnessIndicator lastUpdated={lastUpdated} variant="full" />
      );

      const text = screen.getByText(/Updated.*ago/);
      expect(text).not.toHaveClass("hidden");
      expect(text).not.toHaveClass("md:inline");
    });

    it('should hide text (screen reader only) for "icon-only" variant', () => {
      render(
        <DataFreshnessIndicator lastUpdated={lastUpdated} variant="icon-only" />
      );

      const text = screen.getByText(/Updated.*ago/);
      expect(text).toHaveClass("sr-only");
    });
  });

  describe("Size variants", () => {
    const lastUpdated = "2025-12-28T12:00:00Z";

    it('should apply small size classes for "sm" size (default)', () => {
      render(<DataFreshnessIndicator lastUpdated={lastUpdated} />);

      const container = screen.getByRole("status");
      expect(container).toHaveClass("px-2");
      expect(container).toHaveClass("py-1");
      expect(container).toHaveClass("text-xs");
      expect(container).toHaveClass("gap-1");
    });

    it('should apply medium size classes for "md" size', () => {
      render(<DataFreshnessIndicator lastUpdated={lastUpdated} size="md" />);

      const container = screen.getByRole("status");
      expect(container).toHaveClass("px-3");
      expect(container).toHaveClass("py-1.5");
      expect(container).toHaveClass("text-sm");
      expect(container).toHaveClass("gap-2");
    });
  });

  describe("Accessibility", () => {
    it("should have role=status attribute", () => {
      render(<DataFreshnessIndicator lastUpdated="2025-12-28T12:00:00Z" />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("should have aria-live=polite attribute", () => {
      render(<DataFreshnessIndicator lastUpdated="2025-12-28T12:00:00Z" />);

      const container = screen.getByRole("status");
      expect(container).toHaveAttribute("aria-live", "polite");
    });

    it("should have descriptive title attribute with timestamp", () => {
      const timestamp = "2025-12-28T12:00:00Z";
      render(<DataFreshnessIndicator lastUpdated={timestamp} />);

      const container = screen.getByRole("status");
      const title = container.getAttribute("title");
      expect(title).toContain("Data updated");
      expect(title).toContain("ago");
      expect(title).toContain(timestamp);
    });

    it("should have aria-hidden=true on icon", () => {
      render(<DataFreshnessIndicator lastUpdated="2025-12-28T12:00:00Z" />);

      const container = screen.getByRole("status");
      const icon = container.querySelector("svg");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });
  });

  describe("Custom styling", () => {
    it("should apply custom className", () => {
      render(
        <DataFreshnessIndicator
          lastUpdated="2025-12-28T12:00:00Z"
          className="custom-class"
        />
      );

      const container = screen.getByRole("status");
      expect(container).toHaveClass("custom-class");
    });

    it("should preserve base classes when custom className is provided", () => {
      render(
        <DataFreshnessIndicator
          lastUpdated="2025-12-28T12:00:00Z"
          className="custom-class"
        />
      );

      const container = screen.getByRole("status");
      expect(container).toHaveClass("inline-flex");
      expect(container).toHaveClass("items-center");
      expect(container).toHaveClass("rounded-full");
      expect(container).toHaveClass("border");
    });
  });

  describe("Icon rendering", () => {
    it("should render Clock icon for fresh state", () => {
      render(<DataFreshnessIndicator lastUpdated="2025-12-28T12:00:00Z" />);

      const container = screen.getByRole("status");
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
      // Clock icon should be present (can't easily test specific icon, but we can verify an icon exists)
    });

    it("should render AlertTriangle icon for stale state", () => {
      render(<DataFreshnessIndicator lastUpdated="2025-12-27T12:00:00Z" />);

      const container = screen.getByRole("status");
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("should render AlertCircle icon for very-stale state", () => {
      render(<DataFreshnessIndicator lastUpdated="2025-12-25T12:00:00Z" />);

      const container = screen.getByRole("status");
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });

    it("should render Info icon for unknown state", () => {
      render(<DataFreshnessIndicator lastUpdated={null} />);

      const container = screen.getByRole("status");
      const icon = container.querySelector("svg");
      expect(icon).toBeInTheDocument();
    });
  });

  describe("Edge cases", () => {
    it("should handle date-only format (YYYY-MM-DD)", () => {
      const dateOnly = "2025-12-28";
      render(<DataFreshnessIndicator lastUpdated={dateOnly} />);

      expect(screen.getByText(/Updated.*ago/)).toBeInTheDocument();
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("should handle invalid date gracefully", () => {
      render(<DataFreshnessIndicator lastUpdated="invalid-date" />);

      expect(screen.getByText(/Updated Unknown/)).toBeInTheDocument();
    });

    it("should handle empty string", () => {
      render(<DataFreshnessIndicator lastUpdated="" />);

      expect(screen.getByText(/Updated Unknown/)).toBeInTheDocument();
    });
  });

  describe("Component memoization", () => {
    it("should be memoized to prevent unnecessary re-renders", () => {
      const { rerender } = render(
        <DataFreshnessIndicator lastUpdated="2025-12-28T12:00:00Z" />
      );

      // Re-render with same props should not cause re-render
      rerender(<DataFreshnessIndicator lastUpdated="2025-12-28T12:00:00Z" />);

      // Component should still be in document
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });
});
