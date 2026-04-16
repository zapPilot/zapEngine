import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WalletPortfolioDataWithDirection } from "@/adapters/walletPortfolioDataAdapter";
import { StrategyCard } from "@/components/wallet/portfolio/components/strategy/StrategyCard";
// Import real regimes for testing
import { regimes } from "@/components/wallet/regime/regimeData";

// Mock dependencies
vi.mock("framer-motion", () => ({
  motion: {
    div: vi.fn(({ children, ...props }) => <div {...props}>{children}</div>),
  },
  AnimatePresence: vi.fn(({ children }) => <>{children}</>),
}));

// Mock Lucide icons with concrete implementation to avoid Proxy issues
vi.mock("lucide-react", () => ({
  ChevronDown: () => <div data-testid="icon-chevron-down" />,
  Gauge: () => <div data-testid="icon-gauge" />,
  Info: () => <div data-testid="icon-info" />, // This is what we want to ensure is ABSENT
  // Icons used by DataFreshnessIndicator
  Clock: () => <div data-testid="icon-clock" />,
  AlertTriangle: () => <div data-testid="icon-alert-triangle" />,
  AlertCircle: () => <div data-testid="icon-alert-circle" />,
  // Icons used by regimeData.ts
  TrendingDown: () => <div data-testid="icon-trending-down" />,
  TrendingUp: () => <div data-testid="icon-trending-up" />,
  Pause: () => <div data-testid="icon-pause" />,
}));

// Mock Skeleton to avoid deep imports
vi.mock("../views/DashboardSkeleton", () => ({
  StrategyCardSkeleton: () => <div data-testid="skeleton" />,
}));

const mockData: WalletPortfolioDataWithDirection = {
  totalValueUsd: 10000,
  previousValueUsd: 9000,
  yieldReturnUsd: 50,
  sentimentValue: 50,
  sentimentStatus: "Neutral",
  strategyDirection: "default",
  regimeDuration: {
    hours: 24,
    days: 1,
    human_readable: "1 day",
  },
} as unknown as WalletPortfolioDataWithDirection;

describe("StrategyCard", () => {
  it("renders Current Strategy label without Info icon", () => {
    render(
      <StrategyCard
        data={mockData}
        currentRegime={regimes[2]} // Neutral
      />
    );

    // Label should exist
    expect(screen.getByText("Current Strategy")).toBeInTheDocument();

    // Info icon should NOT exist
    expect(screen.queryByTestId("icon-info")).not.toBeInTheDocument();
  });

  it("renders Gauge icon (sanity check for mocks)", () => {
    render(
      <StrategyCard
        data={mockData}
        currentRegime={regimes[2]} // Neutral
      />
    );

    expect(screen.getByTestId("icon-gauge")).toBeInTheDocument();
  });
});
