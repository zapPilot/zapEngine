import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BorrowingPositionsTooltip } from "@/components/wallet/portfolio/components/shared/BorrowingPositionsTooltip";
import type {
  BorrowingPosition,
  BorrowingSummary,
} from "@/services/analyticsService";

describe("BorrowingPositionsTooltip", () => {
  const mockSummary: BorrowingSummary = {
    overall_status: "healthy",
    worst_health_rate: 1.85,
    total_positions: 2,
  };

  // Test Suite 1: Component States (Loading, Error, Empty, Populated)
  describe("Component States", () => {
    it("displays loading skeleton when isLoading=true", () => {
      const { container } = render(
        <BorrowingPositionsTooltip
          positions={[]}
          summary={mockSummary}
          totalCollateralUsd={0}
          totalDebtUsd={0}
          isLoading={true}
          error={null}
        />
      );

      // Check for skeleton animation class
      const skeleton = container.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveClass("bg-gray-900/95");
    });

    it("displays error state with retry button when error is present", () => {
      const mockError = new Error("Failed to fetch positions");
      const mockRetry = vi.fn();

      render(
        <BorrowingPositionsTooltip
          positions={[]}
          summary={mockSummary}
          totalCollateralUsd={0}
          totalDebtUsd={0}
          isLoading={false}
          error={mockError}
          onRetry={mockRetry}
        />
      );

      expect(screen.getByText("Failed to load positions")).toBeInTheDocument();
      expect(screen.getByText("Failed to fetch positions")).toBeInTheDocument();

      const retryButton = screen.getByText("Try Again");
      fireEvent.click(retryButton);
      expect(mockRetry).toHaveBeenCalledTimes(1);
    });

    it("displays empty state when positions array is empty", () => {
      render(
        <BorrowingPositionsTooltip
          positions={[]}
          summary={mockSummary}
          totalCollateralUsd={0}
          totalDebtUsd={0}
          isLoading={false}
          error={null}
        />
      );

      expect(
        screen.getByText("No borrowing positions found")
      ).toBeInTheDocument();
      expect(
        screen.getByText("You don't have any active debt positions")
      ).toBeInTheDocument();
    });
  });

  // Test Suite 2: Icon + Text Pattern Integration
  describe("Icon + Text Pattern Integration", () => {
    const mockPosition: BorrowingPosition = {
      protocol_id: "aave_v3",
      protocol_name: "Aave V3",
      chain: "ethereum",
      health_rate: 1.85,
      health_status: "healthy",
      collateral_usd: 35750.0,
      debt_usd: 20000.0,
      net_value_usd: 15750.0,
      collateral_tokens: [
        { symbol: "ETH", amount: 10.5, value_usd: 36757.88 },
        { symbol: "USDC", amount: 5000.0, value_usd: 5000.0 },
      ],
      debt_tokens: [{ symbol: "DAI", amount: 20000.0, value_usd: 20000.0 }],
      updated_at: "2026-01-12T10:00:00Z",
    };

    it("renders position card with protocol icon + text labels", async () => {
      render(
        <BorrowingPositionsTooltip
          positions={[mockPosition]}
          summary={mockSummary}
          totalCollateralUsd={35750}
          totalDebtUsd={20000}
          isLoading={false}
          error={null}
        />
      );

      // Protocol icon + name
      expect(screen.getByAltText("Aave V3 logo")).toBeInTheDocument();
      expect(screen.getByText("Aave V3")).toBeInTheDocument();

      // Token icon + text pairs
      expect(screen.getByAltText("ETH icon")).toBeInTheDocument();
      expect(screen.getByText("ETH")).toBeInTheDocument();

      expect(screen.getByAltText("USDC icon")).toBeInTheDocument();
      expect(screen.getByText("USDC")).toBeInTheDocument();

      expect(screen.getByAltText("DAI icon")).toBeInTheDocument();
      expect(screen.getByText("DAI")).toBeInTheDocument();
    });

    it("handles >3 collateral tokens with +N more indicator", () => {
      const positionWithManyTokens: BorrowingPosition = {
        ...mockPosition,
        collateral_tokens: [
          { symbol: "ETH", amount: 10.5, value_usd: 36757.88 },
          { symbol: "USDC", amount: 5000.0, value_usd: 5000.0 },
          { symbol: "WBTC", amount: 1000.0, value_usd: 1000.0 },
          { symbol: "USDT", amount: 2000.0, value_usd: 2000.0 },
        ],
        debt_tokens: [], // Override to avoid duplicate token symbols
      };

      render(
        <BorrowingPositionsTooltip
          positions={[positionWithManyTokens]}
          summary={mockSummary}
          totalCollateralUsd={44757.88}
          totalDebtUsd={20000}
          isLoading={false}
          error={null}
        />
      );

      // First 3 tokens visible
      expect(screen.getByText("ETH")).toBeInTheDocument();
      expect(screen.getByText("USDC")).toBeInTheDocument();
      expect(screen.getByText("WBTC")).toBeInTheDocument();

      // 4th token not shown individually
      expect(screen.queryByText("USDT")).not.toBeInTheDocument();

      // "+1 more" indicator shown
      expect(screen.getByText("+1 more")).toBeInTheDocument();
    });
  });

  // Test Suite 3: Edge Cases
  describe("Edge Cases", () => {
    it("handles very long token symbol names gracefully", () => {
      const positionWithLongSymbol: BorrowingPosition = {
        protocol_id: "aave_v3",
        protocol_name: "Aave V3",
        chain: "ethereum",
        health_rate: 1.85,
        health_status: "healthy",
        collateral_usd: 1000.0,
        debt_usd: 500.0,
        net_value_usd: 500.0,
        collateral_tokens: [
          { symbol: "SUPERLONGTOKEN123456", amount: 100, value_usd: 1000.0 },
        ],
        debt_tokens: [],
        updated_at: "2026-01-12T10:00:00Z",
      };

      render(
        <BorrowingPositionsTooltip
          positions={[positionWithLongSymbol]}
          summary={mockSummary}
          totalCollateralUsd={1000}
          totalDebtUsd={500}
          isLoading={false}
          error={null}
        />
      );

      // Token text should be visible (truncation handled by CSS)
      expect(screen.getByText("SUPERLONGTOKEN123456")).toBeInTheDocument();

      // Check container has flex-wrap for wrapping
      const container = screen.getByText("SUPERLONGTOKEN123456").closest("div");
      expect(container?.parentElement).toHaveClass("flex-wrap");
    });

    it("handles positions with only collateral (no debt)", () => {
      const collateralOnlyPosition: BorrowingPosition = {
        protocol_id: "aave_v3",
        protocol_name: "Aave V3",
        chain: "ethereum",
        health_rate: 99.99,
        health_status: "healthy",
        collateral_usd: 35750.0,
        debt_usd: 0,
        net_value_usd: 35750.0,
        collateral_tokens: [
          { symbol: "ETH", amount: 10.5, value_usd: 36757.88 },
        ],
        debt_tokens: [],
        updated_at: "2026-01-12T10:00:00Z",
      };

      render(
        <BorrowingPositionsTooltip
          positions={[collateralOnlyPosition]}
          summary={mockSummary}
          totalCollateralUsd={35750}
          totalDebtUsd={0}
          isLoading={false}
          error={null}
        />
      );

      // Collateral section visible
      expect(screen.getByText(/Collateral:/)).toBeInTheDocument();

      // Debt section hidden (no debt tokens)
      expect(screen.queryByText(/Debt:/)).not.toBeInTheDocument();
    });

    it("handles CDN icon failures with letter fallbacks", async () => {
      const position: BorrowingPosition = {
        protocol_id: "unknown_protocol",
        protocol_name: "Unknown DeFi",
        chain: "ethereum",
        health_rate: 1.5,
        health_status: "healthy",
        collateral_usd: 1000,
        debt_usd: 500,
        net_value_usd: 500,
        collateral_tokens: [
          { symbol: "MYSTERY", amount: 100, value_usd: 1000 },
        ],
        debt_tokens: [],
        updated_at: "2026-01-12T10:00:00Z",
      };

      render(
        <BorrowingPositionsTooltip
          positions={[position]}
          summary={mockSummary}
          totalCollateralUsd={1000}
          totalDebtUsd={500}
          isLoading={false}
          error={null}
        />
      );

      // Simulate CDN 404 errors on all images
      const images = screen.getAllByRole("img");
      for (const img of images) fireEvent.error(img);

      // Wait for fallback letter badges
      await waitFor(() => {
        expect(screen.getByText("U")).toBeInTheDocument(); // Unknown DeFi
        expect(screen.getByText("M")).toBeInTheDocument(); // MYSTERY
      });
    });
  });

  // Test Suite 4: Accessibility
  describe("Accessibility", () => {
    it("has correct ARIA role and semantic structure", () => {
      const position: BorrowingPosition = {
        protocol_id: "aave_v3",
        protocol_name: "Aave V3",
        chain: "ethereum",
        health_rate: 1.85,
        health_status: "healthy",
        collateral_usd: 35750.0,
        debt_usd: 20000.0,
        net_value_usd: 15750.0,
        collateral_tokens: [
          { symbol: "ETH", amount: 10.5, value_usd: 36757.88 },
        ],
        debt_tokens: [{ symbol: "DAI", amount: 20000.0, value_usd: 20000.0 }],
        updated_at: "2026-01-12T10:00:00Z",
      };

      render(
        <BorrowingPositionsTooltip
          positions={[position]}
          summary={mockSummary}
          totalCollateralUsd={35750}
          totalDebtUsd={20000}
          isLoading={false}
          error={null}
        />
      );

      // Check tooltip role
      expect(screen.getByRole("tooltip")).toBeInTheDocument();

      // Check all images have alt text
      const images = screen.getAllByRole("img");
      for (const img of images) {
        expect(img).toHaveAttribute("alt");
        expect(img.getAttribute("alt")).not.toBe("");
      }
    });
  });

  // Test Suite 5: No Debt Positions (null status/health_rate)
  describe("No Debt Positions (null status values)", () => {
    const mockSummaryNoDebt: BorrowingSummary = {
      has_debt: false,
      worst_health_rate: null,
      overall_status: null,
      critical_count: 0,
      warning_count: 0,
      healthy_count: 0,
    };

    it("shows empty state when overall_status is null", () => {
      render(
        <BorrowingPositionsTooltip
          positions={[]}
          summary={mockSummaryNoDebt}
          totalCollateralUsd={0}
          totalDebtUsd={0}
          isLoading={false}
          error={null}
        />
      );

      expect(
        screen.getByText("No borrowing positions found")
      ).toBeInTheDocument();
      expect(
        screen.getByText("You don't have any active debt positions")
      ).toBeInTheDocument();
    });

    it("shows empty state when worst_health_rate is null", () => {
      render(
        <BorrowingPositionsTooltip
          positions={[]}
          summary={mockSummaryNoDebt}
          totalCollateralUsd={0}
          totalDebtUsd={0}
          isLoading={false}
          error={null}
        />
      );

      expect(
        screen.getByText("No borrowing positions found")
      ).toBeInTheDocument();
    });

    it("does not crash with null summary values and empty positions", () => {
      const { container } = render(
        <BorrowingPositionsTooltip
          positions={[]}
          summary={mockSummaryNoDebt}
          totalCollateralUsd={0}
          totalDebtUsd={0}
          isLoading={false}
          error={null}
        />
      );

      // Should render empty state, not crash
      expect(container.querySelector(".bg-gray-900\\/95")).toBeInTheDocument();
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument(); // Empty state doesn't have tooltip role
    });

    it("handles transition from loading to empty state with null values", () => {
      const { container, rerender } = render(
        <BorrowingPositionsTooltip
          positions={[]}
          summary={mockSummaryNoDebt}
          totalCollateralUsd={0}
          totalDebtUsd={0}
          isLoading={true}
          error={null}
        />
      );

      // Initially loading - check for skeleton animation
      const skeleton = container.querySelector(".animate-pulse");
      expect(skeleton).toBeInTheDocument();

      // Transition to empty state
      rerender(
        <BorrowingPositionsTooltip
          positions={[]}
          summary={mockSummaryNoDebt}
          totalCollateralUsd={0}
          totalDebtUsd={0}
          isLoading={false}
          error={null}
        />
      );

      expect(
        screen.getByText("No borrowing positions found")
      ).toBeInTheDocument();
    });
  });
});
