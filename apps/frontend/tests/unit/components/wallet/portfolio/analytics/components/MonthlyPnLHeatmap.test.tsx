/**
 * Unit tests for MonthlyPnLHeatmap
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MonthlyPnLHeatmap } from "@/components/wallet/portfolio/analytics/components/MonthlyPnLHeatmap";

describe("MonthlyPnLHeatmap", () => {
  const mockPnL = [
    { month: "Jan", value: 5.5, year: 2023 },
    { month: "Feb", value: -2.3, year: 2023 },
    { month: "Mar", value: 0, year: 2023 },
  ];

  it("renders title", () => {
    render(<MonthlyPnLHeatmap monthlyPnL={[]} />);
    expect(screen.getByText("Monthly PnL Heatmap")).toBeInTheDocument();
  });

  it("renders data cells when data present", () => {
    render(<MonthlyPnLHeatmap monthlyPnL={mockPnL} />);

    expect(screen.getByText("+5.5%")).toBeInTheDocument();
    expect(screen.getByText("-2.3%")).toBeInTheDocument();
    expect(screen.getByText("0.0%")).toBeInTheDocument();

    // Check color classes
    const positiveCell = screen.getByText("+5.5%");
    expect(positiveCell).toHaveClass("text-green-300");

    const negativeCell = screen.getByText("-2.3%");
    expect(negativeCell).toHaveClass("text-red-300");
  });

  it("renders empty state when no data and not loading", () => {
    render(<MonthlyPnLHeatmap monthlyPnL={[]} />);
    expect(
      screen.getByText("No monthly data available for this period")
    ).toBeInTheDocument();
  });

  it("renders skeletons when loading", () => {
    const { container } = render(
      <MonthlyPnLHeatmap monthlyPnL={[]} isLoading={true} />
    );
    // Should render month labels "Jan", "Feb" etc. regardless of data
    expect(screen.getByText("Jan")).toBeInTheDocument();
    expect(screen.getByText("Dec")).toBeInTheDocument();
    // And skeletons
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
