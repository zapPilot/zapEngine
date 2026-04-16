import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AllocationLegend } from "@/components/wallet/portfolio/components/allocation/AllocationLegend";

const mockItems = [
  {
    symbol: "BTC",
    percentage: 60,
    color: "#F7931A",
  },
  {
    symbol: "ETH",
    percentage: 30,
    color: "#627EEA",
  },
  {
    symbol: "Stables",
    percentage: 10,
    color: "#26A17B",
    label: "Stablecoins",
  },
];

describe("AllocationLegend", () => {
  it("renders all legend items", () => {
    render(<AllocationLegend items={mockItems} />);

    expect(screen.getByText("BTC")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();

    expect(screen.getByText("ETH")).toBeInTheDocument();
    expect(screen.getByText("30%")).toBeInTheDocument();

    expect(screen.getByText("Stablecoins")).toBeInTheDocument(); // custom label
    expect(screen.getByText("10%")).toBeInTheDocument();
  });

  it("renders nothing when items array is empty", () => {
    const { container } = render(<AllocationLegend items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("applies correct colors", () => {
    render(<AllocationLegend items={mockItems} />);

    const btcText = screen.getByText("BTC");
    expect(btcText).toHaveStyle({ color: "#F7931A" });

    // The dot logic uses style attribute directly
    // Ideally we would put a data-testid on the dot or items to check styles more easily
    // But testing the rendered text color is a good proxy for items needing specific colors
  });
});
