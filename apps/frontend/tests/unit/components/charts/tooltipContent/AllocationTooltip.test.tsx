import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AllocationTooltip } from "@/components/charts/tooltipContent/AllocationTooltip";
import { ASSET_CATEGORIES } from "@/constants/portfolio";

// Mock child components
vi.mock("@/components/charts/tooltipContent/TooltipWrapper", () => ({
  TooltipWrapper: ({ children, date }: any) => (
    <div data-testid="tooltip-wrapper" data-date={date}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/charts/tooltipContent/TooltipRow", () => ({
  TooltipRow: ({ label, labelColor, value, format }: any) => (
    <div
      data-testid="tooltip-row"
      data-label={label}
      data-color={labelColor}
      data-value={value}
      data-format={format}
    >
      {label}: {value}
    </div>
  ),
}));

describe("AllocationTooltip", () => {
  const mockData = {
    date: "2024-01-01",
    btc: 60,
    eth: 30,
    stablecoin: 10,
    altcoin: 0,
    chartType: "asset-allocation" as const, // Added required prop
    x: 0,
    y: 0,
  };

  it("should render TooltipWrapper with correct date", () => {
    render(<AllocationTooltip data={mockData} />);
    const wrapper = screen.getByTestId("tooltip-wrapper");
    expect(wrapper).toHaveAttribute("data-date", "2024-01-01");
  });

  it("should render rows for assets with value > 0.5", () => {
    render(<AllocationTooltip data={mockData} />);
    const rows = screen.getAllByTestId("tooltip-row");

    // btc(60), eth(30), stablecoin(10) > 0.5. altcoin(0) is not.
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveAttribute(
      "data-label",
      ASSET_CATEGORIES.btc.shortLabel
    );
    expect(rows[0]).toHaveAttribute("data-value", "60");

    expect(rows[1]).toHaveAttribute(
      "data-label",
      ASSET_CATEGORIES.eth.shortLabel
    );
    expect(rows[1]).toHaveAttribute("data-value", "30");

    expect(rows[2]).toHaveAttribute(
      "data-label",
      ASSET_CATEGORIES.stablecoin.shortLabel
    );
    expect(rows[2]).toHaveAttribute("data-value", "10");
  });

  it("should not render rows for assets with value <= 0.5", () => {
    const dataWithSmallValues = {
      ...mockData,
      btc: 0.4,
      eth: 0.5, // exact boundary, filter is > 0.5 (strictly greater)
      stablecoin: 0.6,
      altcoin: 0,
    };

    render(<AllocationTooltip data={dataWithSmallValues} />);
    const rows = screen.getAllByTestId("tooltip-row");

    // Only stablecoin > 0.5
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute(
      "data-label",
      ASSET_CATEGORIES.stablecoin.shortLabel
    );
  });

  it("should pass correct colors to TooltipRow", () => {
    render(<AllocationTooltip data={mockData} />);
    const rows = screen.getAllByTestId("tooltip-row");

    expect(rows[0]).toHaveAttribute(
      "data-color",
      ASSET_CATEGORIES.btc.tailwindColor
    );
  });
});
