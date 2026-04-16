import { beforeEach, describe, expect, it, vi } from "vitest";

import { BacktestAllocationBar } from "@/components/wallet/portfolio/views/backtesting/components/BacktestAllocationBar";
import { getBacktestSpotAssetColor } from "@/components/wallet/portfolio/views/backtesting/utils/spotAssetDisplay";
import { getStrategyColor } from "@/components/wallet/portfolio/views/backtesting/utils/strategyDisplay";

import { render, screen } from "../../../../../../../test-utils";

vi.mock(
  "@/components/wallet/portfolio/components/allocation",
  async importOriginal => ({
    ...(await importOriginal<
      typeof import("@/components/wallet/portfolio/components/allocation")
    >()),
    UnifiedAllocationBar: (props: {
      testIdPrefix: string;
      segments: { label: string; percentage: number; color: string }[];
    }) => (
      <div
        data-testid={props.testIdPrefix}
        data-segments={JSON.stringify(props.segments)}
      >
        {props.segments
          .map(
            segment =>
              `${segment.label}:${segment.percentage}:${segment.color.toLowerCase()}`
          )
          .join("|")}
      </div>
    ),
  })
);

vi.mock(
  "@/components/wallet/portfolio/views/backtesting/utils/strategyDisplay",
  () => ({
    getStrategyColor: vi.fn(() => "#ff0000"),
  })
);

const mockedGetStrategyColor = vi.mocked(getStrategyColor);

function getRenderedSegments(testId: string) {
  const rendered = screen.getByTestId(testId);
  const rawSegments = rendered.getAttribute("data-segments");

  expect(rawSegments).toBeTruthy();

  return JSON.parse(rawSegments ?? "[]") as {
    label: string;
    percentage: number;
    color: string;
  }[];
}

describe("BacktestAllocationBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when both spot and stable allocations are zero", () => {
    render(
      <BacktestAllocationBar
        displayName="Test Strategy"
        allocation={{ spot: 0, stable: 0 }}
      />
    );

    expect(screen.queryByText("Test Strategy")).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^backtest-/)).not.toBeInTheDocument();
  });

  it("renders display name and the mapped allocation segments", () => {
    render(
      <BacktestAllocationBar
        displayName="AWP Portfolio"
        allocation={{ spot: 0.6, stable: 0.4 }}
      />
    );

    expect(screen.getByText("AWP Portfolio")).toBeInTheDocument();
    expect(screen.getByTestId("backtest-default")).toHaveTextContent(
      `SPOT:60:${getBacktestSpotAssetColor("BTC").toLowerCase()}|STABLE:40:#2775ca`
    );
  });

  it("renders BTC spot labels with the shared amber chart color", () => {
    render(
      <BacktestAllocationBar
        displayName="BTC Rotation"
        allocation={{ spot: 0.75, stable: 0.25 }}
        spotAssetLabel="BTC"
      />
    );

    expect(screen.getByTestId("backtest-default")).toHaveTextContent(
      `BTC:75:${getBacktestSpotAssetColor("BTC").toLowerCase()}|STABLE:25:#2775ca`
    );
    expect(getRenderedSegments("backtest-default")[0]).toMatchObject({
      label: "BTC",
      color: getBacktestSpotAssetColor("BTC"),
    });
  });

  it("renders ETH spot labels with the shared indigo chart color", () => {
    render(
      <BacktestAllocationBar
        displayName="ETH Rotation"
        allocation={{ spot: 0.75, stable: 0.25 }}
        spotAssetLabel="ETH"
      />
    );

    expect(screen.getByTestId("backtest-default")).toHaveTextContent(
      `ETH:75:${getBacktestSpotAssetColor("ETH").toLowerCase()}|STABLE:25:#2775ca`
    );
    expect(getRenderedSegments("backtest-default")[0]).toMatchObject({
      label: "ETH",
      color: getBacktestSpotAssetColor("ETH"),
    });
  });

  it("renders a strategy color indicator when strategyId is provided", () => {
    mockedGetStrategyColor.mockReturnValue("#3b82f6");

    const { container } = render(
      <BacktestAllocationBar
        displayName="Momentum"
        allocation={{ spot: 1, stable: 0 }}
        strategyId="momentum"
        index={2}
      />
    );

    expect(mockedGetStrategyColor).toHaveBeenCalledWith("momentum", 2);
    expect(
      container.querySelector(".w-2.h-2.rounded-full.shrink-0")
    ).toHaveStyle({ backgroundColor: "#3b82f6" });
    expect(screen.getByTestId("backtest-momentum")).toBeInTheDocument();
  });

  it("omits the color indicator when strategyId is absent", () => {
    const { container } = render(
      <BacktestAllocationBar
        displayName="Custom"
        allocation={{ spot: 0.5, stable: 0.5 }}
      />
    );

    expect(
      container.querySelector(".w-2.h-2.rounded-full.shrink-0")
    ).not.toBeInTheDocument();
  });

  it("filters out zero-percentage segments", () => {
    render(
      <BacktestAllocationBar
        displayName="Spot Only"
        allocation={{ spot: 1, stable: 0 }}
        strategyId="spot_only"
      />
    );

    expect(screen.getByTestId("backtest-spot_only")).toHaveTextContent(
      `SPOT:100:${getBacktestSpotAssetColor("BTC").toLowerCase()}`
    );
    expect(screen.getByTestId("backtest-spot_only")).not.toHaveTextContent(
      "STABLE"
    );
  });

  it("prefers explicit asset allocation over spot labels when available", () => {
    render(
      <BacktestAllocationBar
        displayName="Explicit Buckets"
        allocation={{ spot: 0.7, stable: 0.3 }}
        assetAllocation={{ btc: 0.4, eth: 0.2, stable: 0.3, alt: 0.1 }}
        spotAssetLabel="BTC"
      />
    );

    expect(screen.getByTestId("backtest-default")).toHaveTextContent(
      "BTC:40:#f7931a|STABLE:30:#2775ca|ETH:20:#627eea|ALT:10:#6b7280"
    );
  });
});
