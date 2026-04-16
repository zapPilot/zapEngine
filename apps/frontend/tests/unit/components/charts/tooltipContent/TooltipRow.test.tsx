import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TooltipRow } from "@/components/charts/tooltipContent/TooltipRow";

// Mock formatters to test delegation logic
vi.mock("@/utils/formatters", () => ({
  formatters: {
    currency: (val: number) => `MOCK_CURRENCY_${val}`,
    percent: (val: number, prec: number) => `MOCK_PERCENT_${val}_${prec}`,
    currencyPrecise: (val: number) => `MOCK_PRECISE_${val}`,
  },
}));

describe("TooltipRow", () => {
  it("should render label correctly", () => {
    render(<TooltipRow label="Bitcoin" value="100" />);
    expect(screen.getByText("Bitcoin")).toBeInTheDocument();
  });

  it("should handle undefined value (N/A)", () => {
    render(<TooltipRow label="Bitcoin" value={undefined} />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("should format as text (default)", () => {
    render(<TooltipRow label="Bitcoin" value="User Input" />);
    expect(screen.getByText("User Input")).toBeInTheDocument();
  });

  it("should format number as text implicitly", () => {
    render(<TooltipRow label="Count" value={123} format="text" />);
    expect(screen.getByText("123")).toBeInTheDocument();
  });

  it("should format as currency", () => {
    render(<TooltipRow label="Price" value={1234.56} format="currency" />);
    expect(screen.getByText("MOCK_CURRENCY_1234.56")).toBeInTheDocument();
  });

  it("should format as percent", () => {
    render(
      <TooltipRow label="Change" value={12.5} format="percent" precision={1} />
    );
    expect(screen.getByText("MOCK_PERCENT_12.5_1")).toBeInTheDocument();
  });

  it("should format as percent with custom precision", () => {
    render(
      <TooltipRow label="Change" value={12.5} format="percent" precision={2} />
    );
    expect(screen.getByText("MOCK_PERCENT_12.5_2")).toBeInTheDocument();
  });

  it("should format as currencyPrecise", () => {
    render(
      <TooltipRow
        label="Small Price"
        value={0.00123}
        format="currencyPrecise"
      />
    );
    expect(screen.getByText("MOCK_PRECISE_0.00123")).toBeInTheDocument();
  });

  it("should apply custom colors", () => {
    render(
      <TooltipRow
        label="Custom"
        value="Val"
        labelColor="text-red-500"
        valueColor="text-blue-500"
      />
    );
    const label = screen.getByText("Custom");
    const value = screen.getByText("Val");

    expect(label).toHaveClass("text-red-500");
    expect(value).toHaveClass("text-blue-500");
  });

  it("should render prefix", () => {
    render(<TooltipRow label="Data" value="100" prefix="+" />);
    expect(screen.getByText("+100")).toBeInTheDocument();
  });
});
