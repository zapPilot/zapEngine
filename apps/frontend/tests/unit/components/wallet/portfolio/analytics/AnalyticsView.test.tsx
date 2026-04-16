/**
 * Unit tests for AnalyticsView
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnalyticsView } from "@/components/wallet/portfolio/analytics/AnalyticsView";
import { DEFAULT_ANALYTICS_PERIOD } from "@/components/wallet/portfolio/analytics/constants";

// Mock child components
vi.mock(
  "@/components/wallet/portfolio/analytics/components/AnalyticsHeader",
  () => ({
    AnalyticsHeader: ({
      isExporting,
      showWalletSelector,
      selectedWallet,
    }: any) => (
      <div data-testid="analytics-header">
        <span data-box="isExporting">{String(isExporting)}</span>
        <span data-box="showWalletSelector">{String(showWalletSelector)}</span>
        <span data-box="selectedWallet">{String(selectedWallet)}</span>
      </div>
    ),
  })
);

vi.mock(
  "@/components/wallet/portfolio/analytics/components/ChartSection",
  () => ({
    ChartSection: ({ isLoading, activeChartTab, selectedPeriod }: any) => (
      <div data-testid="chart-section">
        <span data-box="isLoading">{String(isLoading)}</span>
        <span data-box="activeChartTab">{activeChartTab}</span>
        <span data-box="selectedPeriod">{selectedPeriod.key}</span>
      </div>
    ),
  })
);

vi.mock(
  "@/components/wallet/portfolio/analytics/components/KeyMetricsGrid",
  () => ({
    KeyMetricsGrid: ({ isLoading }: any) => (
      <div data-testid="key-metrics-grid">
        <span data-box="isLoading">{String(isLoading)}</span>
      </div>
    ),
  })
);

vi.mock(
  "@/components/wallet/portfolio/analytics/components/AdditionalMetricsGrid",
  () => ({
    AdditionalMetricsGrid: ({ isLoading }: any) => (
      <div data-testid="additional-metrics-grid">
        <span data-box="isLoading">{String(isLoading)}</span>
      </div>
    ),
  })
);

vi.mock(
  "@/components/wallet/portfolio/analytics/components/MonthlyPnLHeatmap",
  () => ({
    MonthlyPnLHeatmap: ({ isLoading }: any) => (
      <div data-testid="heatmap">
        <span data-box="isLoading">{String(isLoading)}</span>
      </div>
    ),
  })
);

describe("AnalyticsView", () => {
  const defaultProps = {
    data: {
      performanceChart: { points: [], startDate: "", endDate: "" },
      drawdownChart: {
        points: [],
        maxDrawdown: 0,
        maxDrawdownDate: "",
      },
      keyMetrics: {} as any,
      monthlyPnL: [],
    },
    selectedPeriod: DEFAULT_ANALYTICS_PERIOD,
    activeChartTab: "performance" as const,
    onPeriodChange: vi.fn(),
    onChartTabChange: vi.fn(),
    onExport: vi.fn(),
    selectedWallet: null,
    availableWallets: [],
    onWalletChange: vi.fn(),
    showWalletSelector: false,
  };

  it("renders all sections correctly", () => {
    render(<AnalyticsView {...defaultProps} />);

    expect(screen.getByTestId("analytics-header")).toBeInTheDocument();
    expect(screen.getByTestId("chart-section")).toBeInTheDocument();
    expect(screen.getByTestId("key-metrics-grid")).toBeInTheDocument();
    expect(screen.getByTestId("additional-metrics-grid")).toBeInTheDocument();
    expect(screen.getByTestId("heatmap")).toBeInTheDocument();
  });

  it("passes loading state to children", () => {
    render(
      <AnalyticsView
        {...defaultProps}
        isLoading={true}
        isMonthlyPnLLoading={true}
      />
    );

    // General loading
    expect(
      screen
        .getByTestId("chart-section")
        .querySelector('[data-box="isLoading"]')
    ).toHaveTextContent("true");
    expect(
      screen
        .getByTestId("key-metrics-grid")
        .querySelector('[data-box="isLoading"]')
    ).toHaveTextContent("true");
    expect(
      screen
        .getByTestId("additional-metrics-grid")
        .querySelector('[data-box="isLoading"]')
    ).toHaveTextContent("true");

    // Independent PnL loading
    expect(
      screen.getByTestId("heatmap").querySelector('[data-box="isLoading"]')
    ).toHaveTextContent("true");
  });

  it("passes export state and wallet data to header", () => {
    render(
      <AnalyticsView
        {...defaultProps}
        isExporting={true}
        showWalletSelector={true}
        selectedWallet="0x123"
      />
    );

    const header = screen.getByTestId("analytics-header");
    expect(header.querySelector('[data-box="isExporting"]')).toHaveTextContent(
      "true"
    );
    expect(
      header.querySelector('[data-box="showWalletSelector"]')
    ).toHaveTextContent("true");
    expect(
      header.querySelector('[data-box="selectedWallet"]')
    ).toHaveTextContent("0x123");
  });

  it("passes chart config to chart section", () => {
    render(
      <AnalyticsView
        {...defaultProps}
        activeChartTab="drawdown"
        selectedPeriod={{ key: "3M", days: 90, label: "3M" }}
      />
    );

    const section = screen.getByTestId("chart-section");
    expect(
      section.querySelector('[data-box="activeChartTab"]')
    ).toHaveTextContent("drawdown");
    expect(
      section.querySelector('[data-box="selectedPeriod"]')
    ).toHaveTextContent("3M");
  });
});
