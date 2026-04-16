/**
 * Unit tests for AdditionalMetricsGrid
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdditionalMetricsGrid } from "@/components/wallet/portfolio/analytics/components/AdditionalMetricsGrid";

describe("AdditionalMetricsGrid", () => {
  const mockMetrics = {
    sortino: { value: "1.5", subValue: "Good", trend: "up" },
    beta: { value: "0.8", subValue: "Low", trend: "neutral" },
    volatility: { value: "12%", subValue: "High", trend: "down" },
    alpha: { value: "+5%", subValue: "Beating Market", trend: "up" },
  } as any;

  it("renders all 4 metrics", () => {
    render(<AdditionalMetricsGrid metrics={mockMetrics} />);
    expect(screen.getByText("Sortino Ratio")).toBeInTheDocument();
    expect(screen.getByText("Beta (vs BTC)")).toBeInTheDocument();
    expect(screen.getByText("Volatility")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();

    expect(screen.getByText("1.5")).toBeInTheDocument();
    expect(screen.getByText("0.8")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByText("+5%")).toBeInTheDocument();
  });

  it("displays fallback values if metrics missing", () => {
    const incompleteMetrics = {
      volatility: { value: "0%", subValue: "None" },
    } as any;
    render(<AdditionalMetricsGrid metrics={incompleteMetrics} />);

    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });

  it("applies value color for positive alpha", () => {
    render(<AdditionalMetricsGrid metrics={mockMetrics} />);
    expect(screen.getByText("+5%")).toHaveClass("text-green-400");
  });

  it("passes loading state", () => {
    render(<AdditionalMetricsGrid metrics={mockMetrics} isLoading={true} />);
    // Should show skeletons (can check for absence of values or presence of skeleton structure)
    // AnalyticsMetricCard test handles skeleton specifics. Here just ensuring it renders without crashing.
    expect(screen.getByText("Sortino Ratio")).toBeInTheDocument();
  });
});
