import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HealthRiskTooltip } from "@/components/wallet/portfolio/components/shared/HealthRiskTooltip";
import { RiskLevel } from "@/constants/riskThresholds";
import type { RiskMetrics } from "@/services/analyticsService";

describe("HealthRiskTooltip", () => {
  const mockRiskMetrics: RiskMetrics = {
    health_rate: 1.5,
    leverage_ratio: 2.0,
    collateral_value_usd: 10000,
    debt_value_usd: 5000,
    liquidation_threshold: 1.2,
    protocol_source: "Aave",
    position_count: 1,
    // Add other required properties if any, based on type definition
  } as RiskMetrics;

  it("renders correctly with safe risk level", () => {
    render(
      <HealthRiskTooltip
        riskMetrics={mockRiskMetrics}
        riskLevel={RiskLevel.SAFE}
        isOwnBundle={true}
      />
    );
    expect(screen.getByText("Position Health")).toBeInTheDocument();
    // Check for the badge specifically (contains emoji + "Safe")
    expect(screen.getByText("🟢 Safe")).toBeInTheDocument();
    expect(screen.getByText("Liquidation Buffer")).toBeInTheDocument();
  });

  it("renders correctly with critical risk level", () => {
    const criticalMetrics = {
      ...mockRiskMetrics,
      health_rate: 1.05,
      liquidation_threshold: 1.0,
    };
    render(
      <HealthRiskTooltip
        riskMetrics={criticalMetrics}
        riskLevel={RiskLevel.CRITICAL}
        isOwnBundle={true}
      />
    );
    expect(screen.getByText(/Critical/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Liquidation risk high. Add collateral or repay debt immediately."
      )
    ).toBeInTheDocument();
  });

  it("shows visitor mode message when isOwnBundle is false", () => {
    render(
      <HealthRiskTooltip
        riskMetrics={mockRiskMetrics}
        riskLevel={RiskLevel.SAFE}
        isOwnBundle={false}
      />
    );
    expect(
      screen.getByText("Switch to your bundle to manage positions")
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /View Detailed Breakdown/i })
    ).not.toBeInTheDocument();
  });

  it("calls onViewDetails when button is clicked", () => {
    const mockOnViewDetails = vi.fn();
    render(
      <HealthRiskTooltip
        riskMetrics={mockRiskMetrics}
        riskLevel={RiskLevel.MODERATE}
        isOwnBundle={true}
        onViewDetails={mockOnViewDetails}
      />
    );

    const button = screen.getByRole("button", {
      name: /View Detailed Breakdown/i,
    });
    fireEvent.click(button);
    expect(mockOnViewDetails).toHaveBeenCalledTimes(1);
  });

  it("renders risky risk level message", () => {
    render(
      <HealthRiskTooltip
        riskMetrics={mockRiskMetrics}
        riskLevel={RiskLevel.RISKY}
        isOwnBundle={true}
      />
    );
    expect(
      screen.getByText(
        "Low safety buffer. Consider adding collateral to reduce risk."
      )
    ).toBeInTheDocument();
  });

  it("renders critical risk message for visitor", () => {
    render(
      <HealthRiskTooltip
        riskMetrics={{ ...mockRiskMetrics, health_rate: 1.05 }}
        riskLevel={RiskLevel.CRITICAL}
        isOwnBundle={false}
      />
    );
    expect(
      screen.getByText("This position is at high risk of liquidation.")
    ).toBeInTheDocument();
  });

  it("renders negative buffer with no + prefix", () => {
    const negativeBuf = {
      ...mockRiskMetrics,
      health_rate: 0.9,
      liquidation_threshold: 1.2,
    };
    render(
      <HealthRiskTooltip
        riskMetrics={negativeBuf}
        riskLevel={RiskLevel.CRITICAL}
        isOwnBundle={true}
      />
    );
    // buffer = 0.9 - 1.2 = -0.30, should not have + prefix
    expect(screen.getByText(/-0\.30 above threshold/)).toBeInTheDocument();
  });

  it("does not show view details button when not own bundle", () => {
    const mockOnViewDetails = vi.fn();
    render(
      <HealthRiskTooltip
        riskMetrics={mockRiskMetrics}
        riskLevel={RiskLevel.SAFE}
        isOwnBundle={false}
        onViewDetails={mockOnViewDetails}
      />
    );
    expect(
      screen.queryByRole("button", { name: /View Detailed Breakdown/i })
    ).not.toBeInTheDocument();
  });

  it("displays multiple positions note when position_count > 1", () => {
    const multiPosMetrics = { ...mockRiskMetrics, position_count: 3 };
    render(
      <HealthRiskTooltip
        riskMetrics={multiPosMetrics}
        riskLevel={RiskLevel.MODERATE}
        isOwnBundle={true}
      />
    );
    expect(
      screen.getByText("Showing your riskiest position")
    ).toBeInTheDocument();
    expect(screen.getByText(/3 positions/)).toBeInTheDocument();
  });
});
