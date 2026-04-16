import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarketDashboardView } from "@/components/wallet/portfolio/views/invest/market/MarketDashboardView";
import { getMarketDashboardData } from "@/services/analyticsService";

// Captured formatter callbacks from recharts props — populated during render
let capturedTooltipFormatter:
  | ((
      value: string | number | (string | number)[],
      name: string | number,
      props: {
        payload?: {
          sentiment_value?: number | null;
          regime?: string | null;
          ratio?: number | null;
          dma_200?: number | null;
        };
      }
    ) => [string | number, string | number])
  | null = null;
let capturedXAxisTickFormatter: ((val: string) => string) | null = null;
let capturedPriceTickFormatter: ((val: number) => string) | null = null;
let capturedFgiActiveDot:
  | ((props: {
      cx?: number;
      cy?: number;
      payload?: { regime?: string | null };
    }) => ReactNode)
  | null = null;

// Mock recharts — jsdom has no SVG layout engine.
// The mocks capture formatter/activeDot callbacks so tests can invoke them
// directly to cover those otherwise-unreachable code paths.
vi.mock("recharts", async () => {
  const { createRechartsChartContainer, createRechartsMockComponent } =
    await import("../../../../../../../utils/rechartsMocks");
  const Box = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const ComposedChart = createRechartsChartContainer();
  const XAxis = createRechartsMockComponent<{
    tickFormatter?: (val: string) => string;
  }>(({ tickFormatter }) => {
    if (tickFormatter) {
      capturedXAxisTickFormatter = tickFormatter;
    }

    return null;
  });
  const YAxis = createRechartsMockComponent<{
    tickFormatter?: (val: number) => string;
    orientation?: string;
  }>(({ tickFormatter, orientation }) => {
    if (tickFormatter && !orientation) {
      capturedPriceTickFormatter = tickFormatter;
    }

    return null;
  });
  const Tooltip = createRechartsMockComponent<{
    formatter?: (
      value: string | number | (string | number)[],
      name: string | number,
      props: {
        payload?: {
          sentiment_value?: number | null;
          regime?: string | null;
          ratio?: number | null;
          dma_200?: number | null;
        };
      }
    ) => [string | number, string | number];
  }>(({ formatter }) => {
    if (formatter) {
      capturedTooltipFormatter = formatter;
    }

    return null;
  });
  const Line = createRechartsMockComponent<{
    activeDot?:
      | ((props: {
          cx?: number;
          cy?: number;
          payload?: { regime?: string | null };
        }) => ReactNode)
      | object;
  }>(({ activeDot }) => {
    if (typeof activeDot === "function") {
      capturedFgiActiveDot = activeDot;
    }

    return null;
  });

  return {
    ResponsiveContainer: Box,
    ComposedChart,
    XAxis,
    YAxis,
    CartesianGrid: () => null,
    Tooltip,
    Legend: () => null,
    ReferenceArea: () => null,
    Line,
  };
});

// Mock the analytics service
vi.mock("@/services/analyticsService", () => ({
  getMarketDashboardData: vi.fn(),
}));

const mockGetMarketDashboardData = vi.mocked(getMarketDashboardData);
const scrollIntoViewMock = vi.fn();

const mockData = {
  snapshots: [
    {
      snapshot_date: "2025-01-01",
      price_usd: 42000,
      dma_200: 38000,
      sentiment_value: 65,
      regime: "g",
      eth_btc_relative_strength: {
        ratio: 0.0532,
        dma_200: 0.0498,
        is_above_dma: true,
      },
    },
    {
      snapshot_date: "2025-01-02",
      price_usd: 43000,
      dma_200: 38500,
      sentiment_value: 70,
      regime: "eg",
      eth_btc_relative_strength: {
        ratio: 0.0541,
        dma_200: 0.05,
        is_above_dma: true,
      },
    },
  ],
  count: 2,
  token_symbol: "btc",
  days_requested: 365,
  timestamp: "2025-01-02T12:00:00Z",
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryWrapper";
  return Wrapper;
}

describe("MarketDashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedTooltipFormatter = null;
    capturedXAxisTickFormatter = null;
    capturedPriceTickFormatter = null;
    capturedFgiActiveDot = null;
    scrollIntoViewMock.mockReset();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });
  });

  it("shows loading spinner while fetching", () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    mockGetMarketDashboardData.mockReturnValue(new Promise(() => {}));
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });

  it("renders market overview header after data loads", async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText("Market Overview")).toBeDefined()
    );
  });

  it("renders all timeframe buttons for BTC and ratio charts", async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByTestId("btc-tf-1Y"));
    // BTC chart timeframe buttons
    expect(screen.getByTestId("btc-tf-1M")).toBeDefined();
    expect(screen.getByTestId("btc-tf-3M")).toBeDefined();
    expect(screen.getByTestId("btc-tf-1Y")).toBeDefined();
    expect(screen.getByTestId("btc-tf-MAX")).toBeDefined();
    // Ratio chart timeframe buttons
    expect(screen.getByTestId("ratio-tf-1M")).toBeDefined();
    expect(screen.getByTestId("ratio-tf-3M")).toBeDefined();
    expect(screen.getByTestId("ratio-tf-1Y")).toBeDefined();
    expect(screen.getByTestId("ratio-tf-MAX")).toBeDefined();
  });

  it("renders BTC price summary cards", async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByText("Current BTC Price"));
    expect(screen.getByText("Current 200 DMA")).toBeDefined();
    expect(screen.getByText("Fear & Greed Index")).toBeDefined();
  });

  it("renders ETH/BTC relative strength section", async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByText("ETH/BTC Ratio vs 200 DMA"));
    expect(screen.getByText("Current ETH/BTC Ratio")).toBeDefined();
    expect(screen.getByText("Ratio 200 DMA")).toBeDefined();
    expect(screen.getByText("Leader Signal")).toBeDefined();
  });

  it("renders section pills for deep-link targets", async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });

    await waitFor(() =>
      expect(screen.getByTestId("market-section-overview")).toBeDefined()
    );
    expect(
      screen.getByTestId("market-section-relative-strength")
    ).toBeDefined();
  });

  it("notifies parent when switching market sections", async () => {
    const onSectionChange = vi.fn();

    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView onSectionChange={onSectionChange} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => screen.getByTestId("market-section-relative-strength"));
    fireEvent.click(screen.getByTestId("market-section-relative-strength"));

    expect(onSectionChange).toHaveBeenCalledWith("relative-strength");
  });

  it("scrolls to the relative strength section for deep links", async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView activeSection="relative-strength" />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled());
  });

  it("switches BTC timeframe on button click", async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByTestId("btc-tf-3M"));
    fireEvent.click(screen.getByTestId("btc-tf-3M"));
    // After clicking 3M, the API is called with 90 days
    await waitFor(() =>
      expect(mockGetMarketDashboardData).toHaveBeenCalledWith(90, "btc")
    );
  });

  it("handles fetch errors gracefully (calls service and does not crash)", async () => {
    mockGetMarketDashboardData.mockRejectedValue(new Error("API failure"));
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => expect(mockGetMarketDashboardData).toHaveBeenCalled());
    // Component renders without throwing — React Query handles the error internally
    expect(document.querySelector(".animate-spin")).not.toBeNull();
  });

  it("calls getMarketDashboardData with 365 days for BTC and 1900 days for ratio on mount", async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(mockGetMarketDashboardData).toHaveBeenCalledWith(365, "btc");
      expect(mockGetMarketDashboardData).toHaveBeenCalledWith(1900, "btc");
    });
  });

  it("switches ratio timeframe independently from BTC timeframe", async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByTestId("ratio-tf-1M"));
    const ratioBtn1M = screen.getByTestId("ratio-tf-1M");
    fireEvent.click(ratioBtn1M);
    // Ratio requests 30 days, BTC still at 365
    await waitFor(() =>
      expect(mockGetMarketDashboardData).toHaveBeenCalledWith(30, "btc")
    );
    // BTC chart call should still have its original 365-day call
    expect(mockGetMarketDashboardData).toHaveBeenCalledWith(365, "btc");
  });

  it("handles null regime in snapshots gracefully", async () => {
    mockGetMarketDashboardData.mockResolvedValue({
      ...mockData,
      snapshots: [
        {
          snapshot_date: "2025-01-01",
          price_usd: 42000,
          dma_200: 38000,
          sentiment_value: 65,
          regime: null,
          eth_btc_relative_strength: null,
        },
      ],
    });
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText("Market Overview")).toBeDefined()
    );
  });

  it("handles empty snapshots array", async () => {
    mockGetMarketDashboardData.mockResolvedValue({
      ...mockData,
      snapshots: [],
    });
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText("Market Overview")).toBeDefined()
    );
  });

  it("handles missing dma_200 with fallback", async () => {
    mockGetMarketDashboardData.mockResolvedValue({
      ...mockData,
      snapshots: [
        {
          snapshot_date: "2025-01-01",
          price_usd: 42000,
          dma_200: null,
          sentiment_value: 65,
          regime: "g",
          eth_btc_relative_strength: null,
        },
      ],
    });
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText("Current BTC Price")).toBeDefined()
    );
  });

  it("handles unknown regime value", async () => {
    mockGetMarketDashboardData.mockResolvedValue({
      ...mockData,
      snapshots: [
        {
          snapshot_date: "2025-01-01",
          price_usd: 42000,
          dma_200: 38000,
          sentiment_value: 65,
          regime: "unknown_regime",
          eth_btc_relative_strength: null,
        },
      ],
    });
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText("Market Overview")).toBeDefined()
    );
  });

  it("handles regime changes between consecutive data points", async () => {
    mockGetMarketDashboardData.mockResolvedValue({
      ...mockData,
      snapshots: [
        {
          snapshot_date: "2025-01-01",
          price_usd: 42000,
          dma_200: 38000,
          sentiment_value: 25,
          regime: "ef",
          eth_btc_relative_strength: null,
        },
        {
          snapshot_date: "2025-01-02",
          price_usd: 43000,
          dma_200: 38500,
          sentiment_value: 45,
          regime: "f",
          eth_btc_relative_strength: null,
        },
        {
          snapshot_date: "2025-01-03",
          price_usd: 44000,
          dma_200: 39000,
          sentiment_value: 55,
          regime: "n",
          eth_btc_relative_strength: null,
        },
        {
          snapshot_date: "2025-01-04",
          price_usd: 45000,
          dma_200: 39500,
          sentiment_value: 75,
          regime: "g",
          eth_btc_relative_strength: null,
        },
        {
          snapshot_date: "2025-01-05",
          price_usd: 46000,
          dma_200: 40000,
          sentiment_value: 90,
          regime: "eg",
          eth_btc_relative_strength: null,
        },
      ],
    });
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText("Market Overview")).toBeDefined()
    );
  });

  it("handles undefined regime in snapshots", async () => {
    mockGetMarketDashboardData.mockResolvedValue({
      ...mockData,
      snapshots: [
        {
          snapshot_date: "2025-01-01",
          price_usd: 42000,
          dma_200: 38000,
          sentiment_value: 65,
          regime: undefined,
          eth_btc_relative_strength: null,
        },
      ],
    });
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText("Market Overview")).toBeDefined()
    );
  });

  // ── Formatter function coverage ──────────────────────────────────────────

  describe("formatXAxisDate", () => {
    it("formats ISO date string to M/D", async () => {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => expect(capturedXAxisTickFormatter).not.toBeNull());
      // 2025-03-05 → month 3, day 5
      expect(capturedXAxisTickFormatter!("2025-03-05")).toBe("3/5");
    });

    it("formats single-digit month/day without padding", async () => {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => expect(capturedXAxisTickFormatter).not.toBeNull());
      expect(capturedXAxisTickFormatter!("2025-01-07")).toBe("1/7");
    });
  });

  describe("formatPriceLabel", () => {
    it("formats a price value to $Xk notation", async () => {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => expect(capturedPriceTickFormatter).not.toBeNull());
      expect(capturedPriceTickFormatter!(50000)).toBe("$50k");
    });

    it("rounds fractional thousands", async () => {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => expect(capturedPriceTickFormatter).not.toBeNull());
      expect(capturedPriceTickFormatter!(42500)).toBe("$43k");
    });
  });

  describe("formatTooltipValue", () => {
    async function renderAndGetFormatter() {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => expect(capturedTooltipFormatter).not.toBeNull());
      return capturedTooltipFormatter!;
    }

    it("formats BTC Price with dollar sign and locale number", async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(95000, "BTC Price", {});
      expect(String(formattedValue)).toContain("95,000");
      expect(label).toBe("BTC Price");
    });

    it("formats 200 DMA with dollar sign and locale number", async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(38500, "200 DMA", {});
      expect(String(formattedValue)).toContain("38,500");
      expect(label).toBe("200 DMA");
    });

    it("formats Fear and Greed Index with raw sentiment and regime label", async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(65, "Fear & Greed Index", {
        payload: { sentiment_value: 65, regime: "g" },
      });
      expect(String(formattedValue)).toBe("65 (Greed)");
      expect(label).toBe("Fear & Greed Index");
    });

    it("formats Fear and Greed Index with empty label when regime is undefined", async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(50, "Fear & Greed Index", {
        payload: { sentiment_value: 50, regime: undefined },
      });
      expect(String(formattedValue)).toBe("50 ()");
      expect(label).toBe("Fear & Greed Index");
    });

    it("formats ETH/BTC Ratio with fixed decimals", async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(0.05321, "ETH/BTC Ratio", {});
      expect(String(formattedValue)).toBe("0.0532");
      expect(label).toBe("ETH/BTC Ratio");
    });

    it("formats Ratio 200 DMA with fixed decimals", async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(0.04981, "Ratio 200 DMA", {});
      expect(String(formattedValue)).toBe("0.0498");
      expect(label).toBe("Ratio 200 DMA");
    });

    it("returns value unchanged for unknown series name (default branch)", async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(42, "Some Other Series", {});
      expect(formattedValue).toBe(42);
      expect(label).toBe("Some Other Series");
    });

    it("formats BTC Price with undefined value falling back to 0", async () => {
      // Exercises the `value ?? 0` branch on line 75 when value is undefined
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(
        undefined as unknown as number,
        "BTC Price",
        {}
      );
      expect(String(formattedValue)).toContain("$0");
      expect(label).toBe("BTC Price");
    });

    it("formats series with undefined name falling back to empty string", async () => {
      // Exercises the `name ?? ""` branch on line 73 when name is undefined
      const fmt = await renderAndGetFormatter();
      const [, label] = fmt(42, undefined as unknown as string, {});
      // labelName becomes "" — neither BTC Price nor 200 DMA nor Fear & Greed Index
      expect(String(label)).toBe("");
    });

    it("formats Fear and Greed Index with null regime producing empty label", async () => {
      // Exercises the `regime ? REGIME_LABELS[regime] : ""` false branch (regime is null)
      const fmt = await renderAndGetFormatter();
      const [formattedValue] = fmt(40, "Fear & Greed Index", {
        payload: { sentiment_value: 40, regime: null },
      });
      expect(String(formattedValue)).toBe("40 ()");
    });
  });

  describe("renderFgiActiveDot", () => {
    async function renderAndGetActiveDot() {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => expect(capturedFgiActiveDot).not.toBeNull());
      return capturedFgiActiveDot!;
    }

    it("renders a circle with regime color", async () => {
      const renderDot = await renderAndGetActiveDot();
      // "g" regime maps to lime (#84cc16)
      const result = renderDot({ cx: 10, cy: 20, payload: { regime: "g" } });
      expect(result).toBeDefined();
      // The rendered element is a <circle> — verify it is not null
      expect(result).not.toBeNull();
    });

    it("uses fallback color when regime is null", async () => {
      const renderDot = await renderAndGetActiveDot();
      const result = renderDot({ cx: 5, cy: 5, payload: { regime: null } });
      expect(result).not.toBeNull();
    });

    it("uses fallback color when regime is unknown", async () => {
      const renderDot = await renderAndGetActiveDot();
      const result = renderDot({ cx: 0, cy: 0, payload: { regime: "xyz" } });
      expect(result).not.toBeNull();
    });

    it("uses default cx/cy of 0 when not provided", async () => {
      const renderDot = await renderAndGetActiveDot();
      const result = renderDot({ payload: { regime: "ef" } });
      expect(result).not.toBeNull();
    });
  });

  describe("regimeBlocks single-element filteredData", () => {
    it("produces one block when filtered data contains exactly one point", async () => {
      // When a single snapshot falls within the selected timeframe the block
      // is both the first element (currentBlock creation) and the last element
      // (i === filteredData.length - 1 push), exercising the combined branch.
      mockGetMarketDashboardData.mockResolvedValue({
        ...mockData,
        snapshots: [
          {
            snapshot_date: "2025-01-01",
            price_usd: 42000,
            dma_200: 38000,
            sentiment_value: 65,
            regime: "g",
            eth_btc_relative_strength: null,
          },
        ],
      });
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() =>
        expect(screen.getByText("Market Overview")).toBeDefined()
      );
      // Verify the FGI stat card shows the value without crashing
      expect(screen.getByText(/65 \/ 100/)).toBeDefined();
    });
  });

  describe("regimeBlocks consecutive same-regime points", () => {
    it("extends block end date when consecutive points share the same regime", async () => {
      // Two consecutive points with the same regime exercise the
      // `currentBlock.end = d.snapshot_date` branch (line 150 in source).
      mockGetMarketDashboardData.mockResolvedValue({
        ...mockData,
        snapshots: [
          {
            snapshot_date: "2025-01-01",
            price_usd: 42000,
            dma_200: 38000,
            sentiment_value: 65,
            regime: "g",
            eth_btc_relative_strength: null,
          },
          {
            snapshot_date: "2025-01-02",
            price_usd: 43000,
            dma_200: 38500,
            sentiment_value: 68,
            regime: "g",
            eth_btc_relative_strength: null,
          },
          {
            snapshot_date: "2025-01-03",
            price_usd: 44000,
            dma_200: 39000,
            sentiment_value: 30,
            regime: "ef",
            eth_btc_relative_strength: null,
          },
        ],
      });
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() =>
        expect(screen.getByText("Market Overview")).toBeDefined()
      );
    });
  });

  describe("relative strength signal", () => {
    it("shows ETH leading when ratio is above DMA", async () => {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => screen.getAllByText("ETH leading"));
      expect(screen.getAllByText("ETH leading").length).toBeGreaterThan(0);
    });

    it("shows BTC leading when ratio is below DMA", async () => {
      mockGetMarketDashboardData.mockResolvedValue({
        ...mockData,
        snapshots: [
          {
            snapshot_date: "2025-01-01",
            price_usd: 42000,
            dma_200: 38000,
            sentiment_value: 65,
            regime: "g",
            eth_btc_relative_strength: {
              ratio: 0.045,
              dma_200: 0.05,
              is_above_dma: false,
            },
          },
        ],
      });
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => screen.getAllByText("BTC leading"));
      expect(screen.getAllByText("BTC leading").length).toBeGreaterThan(0);
    });

    it("shows insufficient data when ratio DMA is unavailable", async () => {
      mockGetMarketDashboardData.mockResolvedValue({
        ...mockData,
        snapshots: [
          {
            snapshot_date: "2025-01-01",
            price_usd: 42000,
            dma_200: 38000,
            sentiment_value: 65,
            regime: "g",
            eth_btc_relative_strength: {
              ratio: 0.045,
              dma_200: null,
              is_above_dma: null,
            },
          },
        ],
      });
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => screen.getAllByText("Insufficient data"));
      expect(screen.getAllByText("Insufficient data").length).toBeGreaterThan(
        0
      );
    });
  });
});
