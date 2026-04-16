import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BacktestChartLegend } from "@/components/wallet/portfolio/views/backtesting/components/BacktestChartLegend";
import type { IndicatorKey } from "@/components/wallet/portfolio/views/backtesting/components/backtestChartLegendData";

const ACTIVE_INDICATORS = new Set<IndicatorKey>([
  "sentiment",
  "btcPrice",
  "dma200",
]);

describe("BacktestChartLegend", () => {
  function noop(): void {
    // noop
  }

  it("renders grouped legends for strategy, indicators, and events", () => {
    render(
      <BacktestChartLegend
        sortedStrategyIds={["dca_classic", "dma_gated_fgi_default"]}
        activeIndicators={ACTIVE_INDICATORS}
        onToggleIndicator={noop}
      />
    );

    expect(screen.getByText("Strategy")).toBeInTheDocument();
    expect(screen.getByText("Market Context")).toBeInTheDocument();
    expect(screen.getByText("Events")).toBeInTheDocument();
  });

  it("includes DMA-first strategy and event labels", () => {
    render(
      <BacktestChartLegend
        sortedStrategyIds={["dca_classic", "dma_gated_fgi_default"]}
        activeIndicators={ACTIVE_INDICATORS}
        onToggleIndicator={noop}
      />
    );

    expect(screen.getByText("DCA Classic")).toBeInTheDocument();
    expect(screen.getByText("DMA Gated FGI Default")).toBeInTheDocument();
    expect(screen.getByText("Sentiment")).toBeInTheDocument();
    expect(screen.getByText("DMA 200")).toBeInTheDocument();
    expect(screen.getByText("Buy Spot")).toBeInTheDocument();
    expect(screen.getByText("Sell Spot")).toBeInTheDocument();
    expect(screen.getByText("Switch to ETH")).toBeInTheDocument();
    expect(screen.getByText("Switch to BTC")).toBeInTheDocument();
  });

  it("calls onToggleIndicator when an indicator button is clicked", () => {
    const onToggleIndicator = vi.fn();
    render(
      <BacktestChartLegend
        sortedStrategyIds={["dca_classic"]}
        activeIndicators={ACTIVE_INDICATORS}
        onToggleIndicator={onToggleIndicator}
      />
    );

    const sentimentButton = screen.getByText("Sentiment").closest("button");
    expect(sentimentButton).not.toBeNull();
    fireEvent.click(sentimentButton!);
    expect(onToggleIndicator).toHaveBeenCalledWith("sentiment");
  });

  it("sets aria-pressed=true for active indicators and false for inactive", () => {
    render(
      <BacktestChartLegend
        sortedStrategyIds={["dca_classic"]}
        activeIndicators={new Set<IndicatorKey>(["sentiment"])}
        onToggleIndicator={noop}
      />
    );

    const sentimentBtn = screen.getByText("Sentiment").closest("button");
    const btcPriceBtn = screen.getByText("BTC Price").closest("button");
    const dma200Btn = screen.getByText("DMA 200").closest("button");

    expect(sentimentBtn?.getAttribute("aria-pressed")).toBe("true");
    expect(btcPriceBtn?.getAttribute("aria-pressed")).toBe("false");
    expect(dma200Btn?.getAttribute("aria-pressed")).toBe("false");
  });

  it("sets aria-pressed=false for all indicator buttons when activeIndicators is empty", () => {
    render(
      <BacktestChartLegend
        sortedStrategyIds={["dca_classic"]}
        activeIndicators={new Set<IndicatorKey>()}
        onToggleIndicator={noop}
      />
    );

    const buttons = screen
      .getAllByRole("button")
      .filter(btn => btn.hasAttribute("aria-pressed"));
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("renders Strategy section title but no strategy color dots when sortedStrategyIds is empty", () => {
    render(
      <BacktestChartLegend
        sortedStrategyIds={[]}
        activeIndicators={ACTIVE_INDICATORS}
        onToggleIndicator={noop}
      />
    );

    // LegendGroup for Strategy returns null when items.length === 0,
    // so neither the "Strategy" heading nor any strategy labels render
    expect(screen.queryByText("Strategy")).toBeNull();
    expect(screen.queryByText("DCA Classic")).toBeNull();
    expect(screen.queryByText("DMA Gated FGI Default")).toBeNull();
    // Events section still renders its own dots
    expect(screen.getByText("Events")).toBeInTheDocument();
  });
});
