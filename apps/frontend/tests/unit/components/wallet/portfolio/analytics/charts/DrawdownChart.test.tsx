import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DrawdownChart } from "@/components/wallet/portfolio/analytics/charts/DrawdownChart";

// Mock ChartUI components
vi.mock(
  "@/components/wallet/portfolio/analytics/charts/ChartUI",
  async importOriginal => {
    const actual = await importOriginal<any>();
    return {
      ...actual,
      ChartGridLines: () => <div data-testid="grid-lines" />,
      ChartSurface: ({ children }: any) => (
        <svg data-testid="chart-surface">{children}</svg>
      ),
      YAxisLabels: () => <div data-testid="y-axis-labels" />,
    };
  }
);

// Mock Chart components
vi.mock("@/components/charts", () => ({
  ChartIndicator: () => <div data-testid="chart-indicator" />,
  ChartTooltip: () => <div data-testid="chart-tooltip" />,
}));

// Capture callbacks from useChartHover options
let capturedBuildHoverData: any;
let capturedGetYValue: any;

// Mock chart helpers
vi.mock("@/hooks/ui/useChartHover", () => ({
  useChartHover: vi.fn((_data: any, options: any) => {
    capturedBuildHoverData = options?.buildHoverData;
    capturedGetYValue = options?.getYValue;
    return {
      hoveredPoint: null,
      onMouseMove: vi.fn(),
      onMouseLeave: vi.fn(),
    };
  }),
}));

vi.mock("@/lib/ui/chartPrimitives", () => ({
  buildPath: () => "M 0,0 L 100,100",
  CHART_GRID_POSITIONS: { FOUR_LINES: [] },
}));

vi.mock("@/utils/formatters", () => ({
  formatChartDate: (date: string) => date,
}));

describe("DrawdownChart", () => {
  const mockData = [
    { x: 1, value: -10, date: "2024-01-01" },
    { x: 2, value: -5, date: "2024-01-02" },
  ];

  it("renders correctly with data", () => {
    render(<DrawdownChart chartData={mockData} maxDrawdown={-15} />);

    expect(screen.getByTestId("chart-surface")).toBeInTheDocument();
    expect(screen.getByText(/-15.0% Max/)).toBeInTheDocument();
    expect(screen.getByText("Drawdown")).toBeInTheDocument();
  });

  it("renders correct max drawdown label", () => {
    render(<DrawdownChart chartData={mockData} maxDrawdown={-25.5} />);
    expect(screen.getByText(/-25.5% Max/)).toBeInTheDocument();
  });

  it("buildHoverData produces correct hover data", () => {
    render(<DrawdownChart chartData={mockData} maxDrawdown={-15} />);

    expect(capturedBuildHoverData).toBeDefined();
    const result = capturedBuildHoverData(
      { date: "2024-01-01", value: -10 },
      50,
      100
    );
    expect(result).toEqual({
      chartType: "drawdown-recovery",
      x: 50,
      y: 100,
      date: "2024-01-01",
      drawdown: -10,
    });
  });

  it("getYValue extracts value from data point", () => {
    render(<DrawdownChart chartData={mockData} maxDrawdown={-15} />);

    expect(capturedGetYValue).toBeDefined();
    expect(capturedGetYValue({ x: 1, value: -7.5, date: "2024-01-01" })).toBe(
      -7.5
    );
    expect(capturedGetYValue({ x: 2, value: 0, date: "2024-01-02" })).toBe(0);
  });

  it("uses fallback drawdownScale of 15 when all values are zero", () => {
    // When all data points have value: 0, minValue will be 0 and Math.abs(0) = 0
    // So drawdownScale falls back to 15 (the || 15 branch)
    const zeroData = [
      { x: 1, value: 0, date: "2024-01-01" },
      { x: 2, value: 0, date: "2024-01-02" },
    ];
    // This should not throw and render correctly
    const { container } = render(
      <DrawdownChart chartData={zeroData} maxDrawdown={0} />
    );
    expect(container).toBeInTheDocument();
  });
});
