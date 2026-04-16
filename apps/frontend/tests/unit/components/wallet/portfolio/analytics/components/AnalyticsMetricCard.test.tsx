/**
 * Unit tests for AnalyticsMetricCard
 */
import { render, screen } from "@testing-library/react";
import { Activity } from "lucide-react";
import { describe, expect, it } from "vitest";

import { AnalyticsMetricCard } from "@/components/wallet/portfolio/analytics/components/AnalyticsMetricCard";

describe("AnalyticsMetricCard", () => {
  const defaultProps = {
    icon: Activity,
    label: "Test Metric",
    value: "123.45",
    subValue: "+10%",
  };

  it("renders metric content correctly", () => {
    render(<AnalyticsMetricCard {...defaultProps} />);
    expect(screen.getByText("Test Metric")).toBeInTheDocument();
    expect(screen.getByText("123.45")).toBeInTheDocument();
    expect(screen.getByText("+10%")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    render(<AnalyticsMetricCard {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Test Metric")).toBeInTheDocument();
    // Value and subvalue should not be visible, skeleton instead
    expect(screen.queryByText("123.45")).not.toBeInTheDocument();
    // Check for skeleton classes
    const skeletons = screen
      .getAllByRole("generic")
      .filter(el => el.className.includes("animate-pulse"));
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("applies custom value color", () => {
    render(<AnalyticsMetricCard {...defaultProps} valueColor="text-red-500" />);
    expect(screen.getByText("123.45")).toHaveClass("text-red-500");
  });
});
