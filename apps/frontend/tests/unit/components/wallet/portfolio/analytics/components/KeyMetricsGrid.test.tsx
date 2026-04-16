import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { KeyMetricsGrid } from "@/components/wallet/portfolio/analytics/components/KeyMetricsGrid";
import type { KeyMetrics } from "@/types/analytics";

// Mock Lucide icons
vi.mock("lucide-react", () => ({
  Activity: () => <div data-testid="icon-activity" />,
  ArrowDownRight: () => <div data-testid="icon-arrow-down" />,
  ArrowUpRight: () => <div data-testid="icon-arrow-up" />,
  Info: () => <div data-testid="icon-info" />, // Verify absence
}));

vi.mock("@/components/ui/BaseCard", () => ({
  BaseCard: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="base-card">{children}</div>
  ),
}));

const mockMetrics: KeyMetrics = {
  timeWeightedReturn: {
    value: "+12.5%",
    subValue: "vs last month",
    trend: "up",
  },
  maxDrawdown: {
    value: "-5.2%",
    subValue: "Low risk",
    trend: "down",
  },
  sharpe: {
    value: "2.4",
    subValue: "Excellent",
    trend: "up",
  },
  winRate: {
    value: "68%",
    subValue: "24 trades",
    trend: "neutral",
  },
};

describe("KeyMetricsGrid", () => {
  it("renders all 4 metrics", () => {
    render(<KeyMetricsGrid metrics={mockMetrics} />);

    expect(screen.getByText("Time-Weighted Return")).toBeInTheDocument();
    expect(screen.getByText("Max Drawdown")).toBeInTheDocument();
    expect(screen.getByText("Sharpe Ratio")).toBeInTheDocument();
    expect(screen.getByText("Win Rate")).toBeInTheDocument();

    expect(screen.getByText("+12.5%")).toBeInTheDocument();
    expect(screen.getByText("-5.2%")).toBeInTheDocument();
  });

  it("renders trend icons correctly", () => {
    render(<KeyMetricsGrid metrics={mockMetrics} />);

    // Should have up arrows
    expect(screen.getAllByTestId("icon-arrow-up").length).toBeGreaterThan(0);
    // Should have down arrows
    expect(screen.getAllByTestId("icon-arrow-down").length).toBeGreaterThan(0);
    // Should have neutral activity icon
    expect(screen.getAllByTestId("icon-activity").length).toBeGreaterThan(0);
  });

  it("does NOT render Info icons next to labels", () => {
    render(<KeyMetricsGrid metrics={mockMetrics} />);
    expect(screen.queryByTestId("icon-info")).not.toBeInTheDocument();
  });

  it("renders skeletons when loading", () => {
    render(<KeyMetricsGrid metrics={mockMetrics} isLoading={true} />);

    // Values should not be shown
    expect(screen.queryByText("+12.5%")).not.toBeInTheDocument();

    // Skeletons should be present (animate-pulse class)
    // We can't easily query by class without custom matcher or test-id on skeletons.
    // But we know BaseCard renders.
    expect(screen.getAllByTestId("base-card")).toHaveLength(4);
  });
});
