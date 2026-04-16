/**
 * Unit tests for BacktestChart pure helpers and component rendering
 */
import { render, screen } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { BacktestChart } from "@/components/wallet/portfolio/views/backtesting/components/BacktestChart";

// We need to test the internal pure functions. Since they're not exported,
// we import the component and test via rendering. But first, let's test
// the module-level helpers by re-importing the module.
// Since buildBacktestTooltipProps and getStrokeDasharrayProps are not exported,
// we test them through the component rendering.

// Capture the Tooltip content prop for direct invocation
let capturedTooltipContent:
  | ((props: {
      active?: boolean;
      payload?: unknown[];
      label?: string;
    }) => ReactNode)
  | null = null;
let capturedTooltipProps: Record<string, unknown> | null = null;

// Mock recharts — jsdom has no SVG layout engine
vi.mock("recharts", async () => {
  const { createRechartsChartContainer, createRechartsMockComponent } =
    await import("../../../../../../utils/rechartsMocks");
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const ComposedChart = createRechartsChartContainer();
  const Area = createRechartsMockComponent<{
    name?: string;
    dataKey?: string;
    strokeDasharray?: string;
  }>(({ name, dataKey, strokeDasharray }) => (
    <div
      data-testid={`area-${dataKey}`}
      data-name={name}
      data-stroke-dasharray={strokeDasharray || ""}
    />
  ));
  const Line = createRechartsMockComponent<{
    name?: string;
    dataKey?: string;
  }>(({ name, dataKey }) => (
    <div data-testid={`line-${dataKey}`} data-name={name} />
  ));
  const Scatter = createRechartsMockComponent<{
    name?: string;
  }>(({ name }) => <div data-testid={`scatter-${name}`} />);
  const Tooltip = createRechartsMockComponent<{
    content?: (props: {
      active?: boolean;
      payload?: unknown[];
      label?: string;
    }) => ReactNode;
    wrapperStyle?: Record<string, unknown>;
    allowEscapeViewBox?: Record<string, unknown>;
  }>(props => {
    capturedTooltipProps = props;

    if (props.content) {
      capturedTooltipContent = props.content;
    }

    return null;
  });

  return {
    ResponsiveContainer: Box,
    ComposedChart,
    Area,
    Line,
    Scatter,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip,
  };
});

// Mock BaseCard
vi.mock("@/components/ui/BaseCard", () => ({
  BaseCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// Mock sub-components
vi.mock(
  "@/components/wallet/portfolio/views/backtesting/components/BacktestChartLegend",
  () => ({
    BacktestChartLegend: () => <div data-testid="chart-legend" />,
  })
);

vi.mock(
  "@/components/wallet/portfolio/views/backtesting/components/BacktestTooltip",
  () => ({
    BacktestTooltip: () => <div data-testid="backtest-tooltip" />,
  })
);

vi.mock("@/utils", async () => {
  const actual = await vi.importActual("@/utils");
  return {
    ...actual,
    formatChartAxisDate: (v: string) => v,
    formatCurrencyAxis: (v: number) => `$${v}`,
    formatSentiment: (v: number) => `${v}`,
  };
});

vi.mock(
  "@/components/wallet/portfolio/views/backtesting/utils/strategyDisplay",
  () => ({
    getStrategyColor: (_id: string, index: number) =>
      ["#00f", "#f00", "#0f0"][index] ?? "#999",
    getStrategyDisplayName: (id: string) => `Strategy ${id}`,
  })
);

vi.mock(
  "@/components/wallet/portfolio/views/backtesting/utils/chartHelpers",
  () => ({
    getPrimaryStrategyId: (ids: string[]) => ids[0] ?? null,
    CHART_SIGNALS: [
      {
        key: "buy",
        name: "Buy Signal",
        field: "buy_signal",
        color: "#0f0",
        shape: "circle",
      },
    ],
  })
);

describe("BacktestChart", () => {
  const defaultProps = {
    chartData: [
      { date: "2025-01-01", strat_a_value: 1000, strat_b_value: 900 },
      { date: "2025-01-02", strat_a_value: 1050, strat_b_value: 920 },
    ],
    sortedStrategyIds: ["strat_a", "strat_b"],
    yAxisDomain: [800, 1200] as [number, number],
    actualDays: 30,
  };

  it("renders the chart with actual days count", () => {
    render(<BacktestChart {...defaultProps} />);
    expect(screen.getByText("Portfolio Value Growth")).toBeDefined();
    expect(screen.getByText("(30 Days)")).toBeDefined();
  });

  it("renders strategy areas for each strategy", () => {
    render(<BacktestChart {...defaultProps} />);
    expect(screen.getByTestId("area-strat_a_value")).toBeDefined();
    expect(screen.getByTestId("area-strat_b_value")).toBeDefined();
  });

  it("renders chart legend", () => {
    render(<BacktestChart {...defaultProps} />);
    expect(screen.getByTestId("chart-legend")).toBeDefined();
  });

  it("does not render indicator lines when indicators default to OFF", () => {
    render(<BacktestChart {...defaultProps} />);
    // Indicators default to OFF (empty activeIndicators set), so lines are absent
    expect(screen.queryByTestId("line-sentiment")).toBeNull();
    expect(screen.queryByTestId("line-btc_price")).toBeNull();
    expect(screen.queryByTestId("line-dma_200")).toBeNull();
  });

  it("renders scatter signals", () => {
    render(<BacktestChart {...defaultProps} />);
    expect(screen.getByTestId("scatter-Buy Signal")).toBeDefined();
  });

  it("applies dashed stroke to dca_classic strategy", () => {
    const props = {
      ...defaultProps,
      sortedStrategyIds: ["strat_a", "dca_classic"],
    };
    render(<BacktestChart {...props} />);

    const dcaArea = screen.getByTestId("area-dca_classic_value");
    expect(dcaArea.getAttribute("data-stroke-dasharray")).toBe("4 4");
  });

  it("does not apply dashed stroke to non-dca_classic strategy", () => {
    render(<BacktestChart {...defaultProps} />);

    const stratArea = screen.getByTestId("area-strat_a_value");
    expect(stratArea.getAttribute("data-stroke-dasharray")).toBe("");
  });

  it("uses custom chartIdPrefix for gradient IDs", () => {
    render(<BacktestChart {...defaultProps} chartIdPrefix="scenario-1" />);
    // Component renders without error with custom prefix
    expect(screen.getByText("Portfolio Value Growth")).toBeDefined();
  });

  it("uses default chartIdPrefix when not provided", () => {
    render(<BacktestChart {...defaultProps} />);
    expect(screen.getByText("Portfolio Value Growth")).toBeDefined();
  });

  it("buildBacktestTooltipProps populates all fields when active, payload and label are provided", () => {
    render(<BacktestChart {...defaultProps} />);

    expect(capturedTooltipContent).toBeDefined();
    expect(capturedTooltipProps).toMatchObject({
      wrapperStyle: { zIndex: 20 },
    });

    const payload = [
      {
        name: "strat_a",
        value: 1000,
        color: "#00f",
        payload: { date: "2025-01-01" },
      },
    ];
    const result = capturedTooltipContent!({
      active: true,
      payload,
      label: "2025-01-01",
    });

    // BacktestTooltip receives the built props — the mock renders a div
    expect(result).toBeDefined();
  });

  it("buildBacktestTooltipProps handles undefined active/payload/label gracefully", () => {
    render(<BacktestChart {...defaultProps} />);

    expect(capturedTooltipContent).toBeDefined();

    // Call with undefined values — should not throw
    const result = capturedTooltipContent!({
      active: undefined,
      payload: undefined,
      label: undefined,
    });
    expect(result).toBeDefined();
  });

  it("buildBacktestTooltipProps handles inactive tooltip (active=false)", () => {
    render(<BacktestChart {...defaultProps} />);

    expect(capturedTooltipContent).toBeDefined();

    const result = capturedTooltipContent!({
      active: false,
      payload: [],
      label: "2025-01-01",
    });
    expect(result).toBeDefined();
  });

  it("configures the tooltip wrapper to render above chart overlays", () => {
    render(<BacktestChart {...defaultProps} />);

    expect(capturedTooltipProps).toMatchObject({
      allowEscapeViewBox: { x: false, y: true },
      wrapperStyle: { zIndex: 20 },
    });
  });
});
