/**
 * Unit tests for ChartSection component
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChartSection } from "@/components/wallet/portfolio/analytics/components/ChartSection";
import type { AnalyticsData, AnalyticsTimePeriod } from "@/types/analytics";

// Mock the chart components
vi.mock(
  "@/components/wallet/portfolio/analytics/charts/PerformanceChart",
  () => ({
    PerformanceChart: () => (
      <div data-testid="performance-chart">Performance Chart</div>
    ),
  })
);

vi.mock("@/components/wallet/portfolio/analytics/charts/DrawdownChart", () => ({
  DrawdownChart: () => <div data-testid="drawdown-chart">Drawdown Chart</div>,
}));

const mockData: AnalyticsData = {
  performanceChart: {
    points: [{ x: 0, y: 100 }],
    startDate: "2025-01-01",
    endDate: "2025-01-31",
  },
  drawdownChart: {
    points: [{ x: 0, y: -5 }],
    maxDrawdown: -12.8,
  },
  summary: {
    totalReturn: 15.5,
    dailyReturn: 0.5,
    volatility: 10.2,
    sharpeRatio: 1.5,
    maxDrawdown: -12.8,
    winRate: 60,
  },
};

const mockPeriod: AnalyticsTimePeriod = {
  key: "1M",
  label: "1M",
  days: 30,
};

describe("ChartSection", () => {
  it("should render chart tabs", () => {
    render(
      <ChartSection
        data={mockData}
        selectedPeriod={mockPeriod}
        activeChartTab="performance"
        onPeriodChange={vi.fn()}
        onChartTabChange={vi.fn()}
      />
    );

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("Drawdown")).toBeInTheDocument();
  });

  it("should call onChartTabChange when tab clicked", () => {
    const mockOnChartTabChange = vi.fn();

    render(
      <ChartSection
        data={mockData}
        selectedPeriod={mockPeriod}
        activeChartTab="performance"
        onPeriodChange={vi.fn()}
        onChartTabChange={mockOnChartTabChange}
      />
    );

    fireEvent.click(screen.getByText("Drawdown"));

    expect(mockOnChartTabChange).toHaveBeenCalledWith("drawdown");
  });

  it("should render PerformanceChart when activeChartTab is performance", () => {
    render(
      <ChartSection
        data={mockData}
        selectedPeriod={mockPeriod}
        activeChartTab="performance"
        onPeriodChange={vi.fn()}
        onChartTabChange={vi.fn()}
      />
    );

    expect(screen.getByTestId("performance-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("drawdown-chart")).not.toBeInTheDocument();
  });

  it("should render DrawdownChart when activeChartTab is drawdown", () => {
    render(
      <ChartSection
        data={mockData}
        selectedPeriod={mockPeriod}
        activeChartTab="drawdown"
        onPeriodChange={vi.fn()}
        onChartTabChange={vi.fn()}
      />
    );

    expect(screen.getByTestId("drawdown-chart")).toBeInTheDocument();
    expect(screen.queryByTestId("performance-chart")).not.toBeInTheDocument();
  });

  it("should call onPeriodChange when period button clicked", () => {
    const mockOnPeriodChange = vi.fn();

    render(
      <ChartSection
        data={mockData}
        selectedPeriod={mockPeriod}
        activeChartTab="performance"
        onPeriodChange={mockOnPeriodChange}
        onChartTabChange={vi.fn()}
      />
    );

    // Find and click a period button (3M)
    const periodButton = screen.getByText("3M");
    fireEvent.click(periodButton);

    expect(mockOnPeriodChange).toHaveBeenCalled();
  });

  it("should show loading skeleton when isLoading is true", () => {
    render(
      <ChartSection
        data={mockData}
        selectedPeriod={mockPeriod}
        activeChartTab="performance"
        onPeriodChange={vi.fn()}
        onChartTabChange={vi.fn()}
        isLoading={true}
      />
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByTestId("performance-chart")).not.toBeInTheDocument();
  });

  it("should disable buttons when loading", () => {
    render(
      <ChartSection
        data={mockData}
        selectedPeriod={mockPeriod}
        activeChartTab="performance"
        onPeriodChange={vi.fn()}
        onChartTabChange={vi.fn()}
        isLoading={true}
      />
    );

    const performanceButton = screen.getByText("Performance");
    expect(performanceButton).toBeDisabled();
  });

  it("should apply active styles to selected tab", () => {
    render(
      <ChartSection
        data={mockData}
        selectedPeriod={mockPeriod}
        activeChartTab="performance"
        onPeriodChange={vi.fn()}
        onChartTabChange={vi.fn()}
      />
    );

    const performanceButton = screen.getByText("Performance").closest("button");
    expect(performanceButton).toHaveClass("bg-gray-700");
  });
});
