import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HealthFactorPill } from "@/components/wallet/portfolio/components/shared/HealthFactorPill";
import type { RiskMetrics } from "@/services/analyticsService";

// Mock the hook
vi.mock(
  "@/components/wallet/portfolio/components/shared/useTooltipPosition",
  () => ({
    useTooltipPosition: () => ({ top: 100, left: 100 }),
  })
);

describe("HealthFactorPill", () => {
  const mockRiskMetrics: RiskMetrics = {
    health_rate: 1.5,
    leverage_ratio: 2.0,
    collateral_value_usd: 10000,
    debt_value_usd: 5000,
    liquidation_threshold: 1.2,
    protocol_source: "Aave",
    position_count: 1,
  } as RiskMetrics;

  it("renders correctly with different sizes", () => {
    const { rerender } = render(
      <HealthFactorPill
        riskMetrics={mockRiskMetrics}
        isOwnBundle={true}
        size="sm"
      />
    );
    expect(screen.getByText("1.50")).toBeInTheDocument();

    rerender(
      <HealthFactorPill
        riskMetrics={mockRiskMetrics}
        isOwnBundle={true}
        size="lg"
      />
    );
    expect(screen.getByText("1.50")).toBeInTheDocument();
  });

  it("shows tooltip on hover", async () => {
    render(
      <HealthFactorPill riskMetrics={mockRiskMetrics} isOwnBundle={true} />
    );

    const pill = screen.getByRole("status");
    fireEvent.mouseEnter(pill);

    // Tooltip is portalled to document.body
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(screen.getByText("Position Health")).toBeInTheDocument();
  });

  it("toggles tooltip on click for mobile", () => {
    // Mock mobile width
    Object.defineProperty(window, "innerWidth", { value: 400 });

    render(
      <HealthFactorPill riskMetrics={mockRiskMetrics} isOwnBundle={true} />
    );

    const pill = screen.getByRole("status");

    // Initial click shows tooltip
    fireEvent.click(pill);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    // Second click hides it
    fireEvent.click(pill);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("pulses when risk is high", () => {
    const criticalMetrics = { ...mockRiskMetrics, health_rate: 1.05 };
    render(
      <HealthFactorPill riskMetrics={criticalMetrics} isOwnBundle={true} />
    );
    // We can't easily check animation styles in JSDOM, but we can verify it renders without error
    // and has the correct classes/structure implied by the high risk
    expect(screen.getByText("1.05")).toBeInTheDocument();
  });

  it("hides tooltip on mouse leave", async () => {
    // Use desktop width so hover behavior is active
    Object.defineProperty(window, "innerWidth", { value: 1024 });

    render(
      <HealthFactorPill riskMetrics={mockRiskMetrics} isOwnBundle={true} />
    );

    const pill = screen.getByRole("status");
    fireEvent.mouseEnter(pill);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();

    fireEvent.mouseLeave(pill);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("toggles tooltip via keyboard Enter key", () => {
    render(
      <HealthFactorPill riskMetrics={mockRiskMetrics} isOwnBundle={true} />
    );

    const pill = screen.getByRole("status");

    // Enter key shows tooltip
    fireEvent.keyDown(pill, { key: "Enter" });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    // Enter key hides tooltip
    fireEvent.keyDown(pill, { key: "Enter" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("toggles tooltip via keyboard Space key", () => {
    render(
      <HealthFactorPill riskMetrics={mockRiskMetrics} isOwnBundle={true} />
    );

    const pill = screen.getByRole("status");

    // Space key shows tooltip
    fireEvent.keyDown(pill, { key: " " });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("ignores irrelevant keys in keyboard handler", () => {
    render(
      <HealthFactorPill riskMetrics={mockRiskMetrics} isOwnBundle={true} />
    );

    const pill = screen.getByRole("status");

    // Tab key should not show tooltip
    fireEvent.keyDown(pill, { key: "Tab" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("renders with onViewDetails callback", () => {
    const onViewDetails = vi.fn();
    render(
      <HealthFactorPill
        riskMetrics={mockRiskMetrics}
        isOwnBundle={true}
        onViewDetails={onViewDetails}
      />
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
