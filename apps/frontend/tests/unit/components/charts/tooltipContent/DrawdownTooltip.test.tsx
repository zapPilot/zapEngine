import { describe, expect, it, vi } from "vitest";

import { DrawdownTooltip } from "@/components/charts/tooltipContent/DrawdownTooltip";
import type { DrawdownHoverData } from "@/types/ui/chartHover";

import { render, screen } from "../../../../test-utils";

vi.mock("@/utils/chartHoverUtils", () => ({
  getDrawdownSeverity: vi.fn(() => "Minor"),
  getDrawdownSeverityColor: vi.fn(() => ({
    bgColor: "bg-yellow-100",
    color: "text-yellow-700",
  })),
}));

vi.mock("@/utils/formatters", () => ({
  formatters: {
    percent: vi.fn((val: number, _dec: number) => `${val.toFixed(2)}%`),
  },
}));

vi.mock("@/components/charts/tooltipContent/TooltipWrapper", () => ({
  TooltipWrapper: ({
    date,
    children,
  }: {
    date: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="tooltip-wrapper" data-date={date}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/charts/tooltipContent/TooltipRow", () => ({
  TooltipRow: ({ label, value }: { label: string; value: string | number }) => (
    <div data-testid={`row-${label}`}>
      {label}: {value}
    </div>
  ),
}));

function createDrawdownData(overrides = {}): DrawdownHoverData {
  return {
    chartType: "drawdown-recovery" as const,
    x: 100,
    y: 200,
    date: "2025-01-15",
    drawdown: -15.5,
    ...overrides,
  };
}

describe("DrawdownTooltip", () => {
  it("renders drawdown value via TooltipRow", () => {
    const data = createDrawdownData({ drawdown: -15.5 });
    render(<DrawdownTooltip data={data} />);

    expect(screen.getByTestId("row-Drawdown")).toBeInTheDocument();
    expect(screen.getByTestId("row-Drawdown")).toHaveTextContent(
      "Drawdown: -15.50%"
    );
  });

  it("renders severity badge with correct severity text", () => {
    const data = createDrawdownData();
    render(<DrawdownTooltip data={data} />);

    expect(screen.getByText("Minor")).toBeInTheDocument();
  });

  it("renders peakDate when provided", () => {
    const data = createDrawdownData({ peakDate: "2025-01-01" });
    render(<DrawdownTooltip data={data} />);

    expect(screen.getByTestId("row-Peak Date")).toBeInTheDocument();
    expect(screen.getByTestId("row-Peak Date")).toHaveTextContent(
      "Peak Date: 2025-01-01"
    );
  });

  it("does NOT render peakDate when not provided", () => {
    const data = createDrawdownData({ peakDate: undefined });
    render(<DrawdownTooltip data={data} />);

    expect(screen.queryByTestId("row-Peak Date")).not.toBeInTheDocument();
  });

  it("renders distanceFromPeak when provided", () => {
    const data = createDrawdownData({ distanceFromPeak: 45 });
    render(<DrawdownTooltip data={data} />);

    expect(screen.getByTestId("row-Days from Peak")).toBeInTheDocument();
    expect(screen.getByTestId("row-Days from Peak")).toHaveTextContent(
      "Days from Peak: 45"
    );
  });

  it("does NOT render distanceFromPeak when not provided", () => {
    const data = createDrawdownData({ distanceFromPeak: undefined });
    render(<DrawdownTooltip data={data} />);

    expect(screen.queryByTestId("row-Days from Peak")).not.toBeInTheDocument();
  });

  it("renders recoveryDurationDays when provided", () => {
    const data = createDrawdownData({ recoveryDurationDays: 30 });
    render(<DrawdownTooltip data={data} />);

    expect(screen.getByTestId("row-Recovery Time")).toBeInTheDocument();
    expect(screen.getByTestId("row-Recovery Time")).toHaveTextContent(
      "Recovery Time: 30 days"
    );
  });

  it("renders recoveryDepth when provided", () => {
    const data = createDrawdownData({ recoveryDepth: -20.5 });
    render(<DrawdownTooltip data={data} />);

    expect(screen.getByTestId("row-Cycle Depth")).toBeInTheDocument();
    expect(screen.getByTestId("row-Cycle Depth")).toHaveTextContent(
      "Cycle Depth: -20.50%"
    );
  });

  it("renders NewPeakIndicator when isRecoveryPoint is true", () => {
    const data = createDrawdownData({ isRecoveryPoint: true });
    render(<DrawdownTooltip data={data} />);

    expect(screen.getByText("New Peak")).toBeInTheDocument();
  });

  it("does NOT render NewPeakIndicator when isRecoveryPoint is false/undefined", () => {
    const data = createDrawdownData({ isRecoveryPoint: false });
    render(<DrawdownTooltip data={data} />);

    expect(screen.queryByText("New Peak")).not.toBeInTheDocument();
  });
});
