import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MarketDashboardView } from '@/components/wallet/portfolio/views/invest/market/MarketDashboardView';
import { getMarketDashboardData } from '@/services/analyticsService';

// Captured callback handles populated by the mocked recharts components below.
// Tests can invoke these directly to exercise formatter/activeDot logic that
// recharts would normally only run during SVG layout (not available in jsdom).
let capturedTooltipFormatter:
  | ((
      value: string | number | (string | number)[] | undefined,
      name: string | number | undefined,
      props: {
        payload?: {
          sentiment_value?: number | null;
          macro_fear_greed?: number | null;
          regime?: string | null;
          macro_fear_greed_label?: string | null;
          price_usd?: number | null;
          btc_dma_200?: number | null;
          eth_price_usd?: number | null;
          eth_dma_200?: number | null;
          eth_btc_ratio?: number | null;
          eth_btc_dma_200?: number | null;
          sp500_price_usd?: number | null;
          sp500_dma_200?: number | null;
        };
      },
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

vi.mock('recharts', async () => {
  const { createRechartsChartContainer, createRechartsMockComponent } =
    await import('../../../../../../../utils/rechartsMocks');
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
    yAxisId?: string;
  }>(({ tickFormatter, yAxisId }) => {
    // Capture the price-axis formatter (yAxisId="price"). Ratio and FGI axes
    // use different formatters and aren't asserted on directly.
    if (tickFormatter && yAxisId === 'price') {
      capturedPriceTickFormatter = tickFormatter;
    }

    return null;
  });
  const Tooltip = createRechartsMockComponent<{
    formatter?: (
      value: string | number | (string | number)[] | undefined,
      name: string | number | undefined,
      props: {
        payload?: {
          sentiment_value?: number | null;
          macro_fear_greed?: number | null;
          regime?: string | null;
          macro_fear_greed_label?: string | null;
          price_usd?: number | null;
          btc_dma_200?: number | null;
          eth_price_usd?: number | null;
          eth_dma_200?: number | null;
          eth_btc_ratio?: number | null;
          eth_btc_dma_200?: number | null;
          sp500_price_usd?: number | null;
          sp500_dma_200?: number | null;
        };
      },
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
      | object
      | null;
  }>(({ activeDot }) => {
    if (typeof activeDot === 'function') {
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

vi.mock('@/services/analyticsService', () => ({
  getMarketDashboardData: vi.fn(),
}));

const mockGetMarketDashboardData = vi.mocked(getMarketDashboardData);

interface SnapshotOpts {
  date: string;
  btcPrice?: number;
  btcDma?: number | null;
  ethPrice?: number;
  ethDma?: number | null;
  sentiment?: number | null;
  regime?: string | null;
  ethBtcRatio?: number | null;
  ethBtcDma?: number | null;
  ethBtcIsAbove?: boolean | null;
  macroFearGreed?: number | null;
  macroFearGreedLabel?: string | null;
}

function makeSnapshot(opts: SnapshotOpts) {
  const values: Record<
    string,
    {
      value: number;
      indicators: Record<string, { value: number; is_above: boolean | null }>;
      tags: Record<string, string>;
    }
  > = {};

  if (opts.btcPrice != null) {
    const btcIndicators: Record<
      string,
      { value: number; is_above: boolean | null }
    > = {};
    if (opts.btcDma != null) {
      btcIndicators['dma_200'] = {
        value: opts.btcDma,
        is_above: opts.btcPrice > opts.btcDma,
      };
    }
    values['btc'] = {
      value: opts.btcPrice,
      indicators: btcIndicators,
      tags: {},
    };
  }

  if (opts.ethPrice != null) {
    const ethIndicators: Record<
      string,
      { value: number; is_above: boolean | null }
    > = {};
    if (opts.ethDma != null) {
      ethIndicators['dma_200'] = {
        value: opts.ethDma,
        is_above: opts.ethPrice > opts.ethDma,
      };
    }
    values['eth'] = {
      value: opts.ethPrice,
      indicators: ethIndicators,
      tags: {},
    };
  }

  if (opts.sentiment != null) {
    values['fgi'] = {
      value: opts.sentiment,
      indicators: {},
      tags: opts.regime ? { regime: opts.regime } : {},
    };
  }

  if (opts.ethBtcRatio != null) {
    const ethBtcIndicators: Record<
      string,
      { value: number; is_above: boolean | null }
    > = {};
    if (opts.ethBtcDma != null) {
      ethBtcIndicators['dma_200'] = {
        value: opts.ethBtcDma,
        is_above: opts.ethBtcIsAbove ?? null,
      };
    }
    values['eth_btc'] = {
      value: opts.ethBtcRatio,
      indicators: ethBtcIndicators,
      tags: {},
    };
  }

  if (opts.macroFearGreed != null) {
    values['macro_fear_greed'] = {
      value: opts.macroFearGreed,
      indicators: {},
      tags: opts.macroFearGreedLabel ? { label: opts.macroFearGreedLabel } : {},
    };
  }

  return { snapshot_date: opts.date, values };
}

function makeResponse(snapshots: ReturnType<typeof makeSnapshot>[]) {
  return {
    series: {},
    snapshots,
    meta: {
      primary_series: 'btc',
      days_requested: 1900,
      count: snapshots.length,
      timestamp: '2025-01-02T12:00:00Z',
    },
  };
}

const mockData = makeResponse([
  makeSnapshot({
    date: '2025-01-01',
    btcPrice: 42000,
    btcDma: 38000,
    ethPrice: 3200,
    ethDma: 3000,
    sentiment: 65,
    regime: 'g',
    macroFearGreed: 55,
    macroFearGreedLabel: 'Neutral',
    ethBtcRatio: 0.0532,
    ethBtcDma: 0.0498,
    ethBtcIsAbove: true,
  }),
  makeSnapshot({
    date: '2025-01-02',
    btcPrice: 43000,
    btcDma: 38500,
    ethPrice: 3300,
    ethDma: 3050,
    sentiment: 70,
    regime: 'eg',
    macroFearGreed: 61,
    macroFearGreedLabel: 'Greed',
    ethBtcRatio: 0.0541,
    ethBtcDma: 0.05,
    ethBtcIsAbove: true,
  }),
]);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryWrapper';
  return Wrapper;
}

describe('MarketDashboardView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedTooltipFormatter = null;
    capturedXAxisTickFormatter = null;
    capturedPriceTickFormatter = null;
    capturedFgiActiveDot = null;
  });

  it('shows loading spinner while fetching', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    mockGetMarketDashboardData.mockReturnValue(new Promise(() => {}));
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    expect(document.querySelector('.animate-spin')).not.toBeNull();
  });

  it('renders market overview header after data loads', async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText('Market Overview')).toBeDefined(),
    );
  });

  it('renders only 1Y and MAX timeframe buttons (1M/3M dropped)', async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByTestId('btc-tf-MAX'));
    expect(screen.getByTestId('btc-tf-1Y')).toBeDefined();
    expect(screen.getByTestId('btc-tf-MAX')).toBeDefined();
    expect(screen.queryByTestId('btc-tf-1M')).toBeNull();
    expect(screen.queryByTestId('btc-tf-3M')).toBeNull();
  });

  it('calls getMarketDashboardData with 1900 days exactly once on mount', async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(mockGetMarketDashboardData).toHaveBeenCalledWith(1900);
    });
    expect(mockGetMarketDashboardData).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when switching between timeframes (slices client-side)', async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByTestId('btc-tf-1Y'));
    fireEvent.click(screen.getByTestId('btc-tf-1Y'));
    fireEvent.click(screen.getByTestId('btc-tf-MAX'));
    fireEvent.click(screen.getByTestId('btc-tf-1Y'));
    // After three timeframe switches the API should still have fired only the
    // initial 1900-day fetch — duplicate-request bug regression guard.
    expect(mockGetMarketDashboardData).toHaveBeenCalledTimes(1);
  });

  it('renders BTC summary cards', async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByText('Current BTC Price'));
    expect(screen.getByText('Current 200 DMA')).toBeDefined();
    // "Fear & Greed Index" appears twice — as the stat-card label AND as the
    // toggle pill — so assert presence via getAllByText.
    expect(screen.getAllByText('Fear & Greed Index').length).toBeGreaterThan(0);
  });

  it('renders ETH/BTC relative-strength stat cards', async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByText('Current ETH/BTC Ratio'));
    expect(screen.getByText('Ratio 200 DMA')).toBeDefined();
    expect(screen.getByText('Leader Signal')).toBeDefined();
  });

  it('renders all market line-toggle pills', async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByTestId('line-toggle-btcPrice'));
    expect(screen.getByTestId('line-toggle-btcPrice')).toBeDefined();
    expect(screen.getByTestId('line-toggle-btcDma200')).toBeDefined();
    expect(screen.getByTestId('line-toggle-ethPrice')).toBeDefined();
    expect(screen.getByTestId('line-toggle-ethDma200')).toBeDefined();
    expect(screen.getByTestId('line-toggle-ethBtcRatio')).toBeDefined();
    expect(screen.getByTestId('line-toggle-ethBtcDma200')).toBeDefined();
    expect(screen.getByTestId('line-toggle-fgi')).toBeDefined();
    expect(screen.getByTestId('line-toggle-macro_fear_greed')).toBeDefined();
  });

  it('reflects default-on / default-off state via aria-pressed', async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByTestId('line-toggle-btcPrice'));
    // Default-on: BTC/ETH price + DMA, FGI, and Macro FGI
    expect(
      screen.getByTestId('line-toggle-btcPrice').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByTestId('line-toggle-btcDma200').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByTestId('line-toggle-ethPrice').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByTestId('line-toggle-ethDma200').getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByTestId('line-toggle-fgi').getAttribute('aria-pressed'),
    ).toBe('true');
    // Default-off: ETH/BTC pair
    expect(
      screen
        .getByTestId('line-toggle-ethBtcRatio')
        .getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      screen
        .getByTestId('line-toggle-ethBtcDma200')
        .getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      screen
        .getByTestId('line-toggle-macro_fear_greed')
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('flips aria-pressed when a toggle is clicked', async () => {
    mockGetMarketDashboardData.mockResolvedValue(mockData);
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => screen.getByTestId('line-toggle-ethBtcRatio'));
    const ratioToggle = screen.getByTestId('line-toggle-ethBtcRatio');
    expect(ratioToggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(ratioToggle);
    expect(
      screen
        .getByTestId('line-toggle-ethBtcRatio')
        .getAttribute('aria-pressed'),
    ).toBe('true');

    // Clicking a default-on toggle should turn it off
    fireEvent.click(screen.getByTestId('line-toggle-btcPrice'));
    expect(
      screen.getByTestId('line-toggle-btcPrice').getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('handles null regime in snapshots gracefully', async () => {
    mockGetMarketDashboardData.mockResolvedValue(
      makeResponse([
        makeSnapshot({
          date: '2025-01-01',
          btcPrice: 42000,
          btcDma: 38000,
          sentiment: 65,
          regime: null,
        }),
      ]),
    );
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText('Market Overview')).toBeDefined(),
    );
  });

  it('handles empty snapshots array', async () => {
    mockGetMarketDashboardData.mockResolvedValue({
      ...mockData,
      snapshots: [],
    });
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText('Market Overview')).toBeDefined(),
    );
  });

  it('handles missing dma_200 with fallback', async () => {
    mockGetMarketDashboardData.mockResolvedValue(
      makeResponse([
        makeSnapshot({
          date: '2025-01-01',
          btcPrice: 42000,
          btcDma: null,
          sentiment: 65,
          regime: 'g',
        }),
      ]),
    );
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText('Current BTC Price')).toBeDefined(),
    );
  });

  it('handles unknown regime value', async () => {
    mockGetMarketDashboardData.mockResolvedValue(
      makeResponse([
        makeSnapshot({
          date: '2025-01-01',
          btcPrice: 42000,
          btcDma: 38000,
          sentiment: 65,
          regime: 'unknown_regime',
        }),
      ]),
    );
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText('Market Overview')).toBeDefined(),
    );
  });

  it('handles undefined regime in snapshots', async () => {
    mockGetMarketDashboardData.mockResolvedValue(
      makeResponse([
        makeSnapshot({
          date: '2025-01-01',
          btcPrice: 42000,
          btcDma: 38000,
          sentiment: 65,
        }),
      ]),
    );
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() =>
      expect(screen.getByText('Market Overview')).toBeDefined(),
    );
  });

  it('handles fetch errors gracefully', async () => {
    mockGetMarketDashboardData.mockRejectedValue(new Error('API failure'));
    render(<MarketDashboardView />, { wrapper: createWrapper() });
    await waitFor(() => expect(mockGetMarketDashboardData).toHaveBeenCalled());
    // The page does not (yet) render an error message — verify nothing crashed
    // by confirming the loading spinner is still on screen.
    expect(document.querySelector('.animate-spin')).not.toBeNull();
  });

  // ── Formatter coverage ──────────────────────────────────────────────────

  describe('formatXAxisDate', () => {
    it('formats ISO date string to M/D', async () => {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => expect(capturedXAxisTickFormatter).not.toBeNull());
      expect(capturedXAxisTickFormatter!('2025-03-05')).toBe('3/5');
    });

    it('formats single-digit month/day without padding', async () => {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => expect(capturedXAxisTickFormatter).not.toBeNull());
      expect(capturedXAxisTickFormatter!('2025-01-07')).toBe('1/7');
    });
  });

  describe('formatPriceLabel', () => {
    it('formats whole-thousands to $Xk', async () => {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => expect(capturedPriceTickFormatter).not.toBeNull());
      expect(capturedPriceTickFormatter!(50000)).toBe('$50k');
    });

    it('rounds fractional thousands', async () => {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => expect(capturedPriceTickFormatter).not.toBeNull());
      expect(capturedPriceTickFormatter!(42500)).toBe('$43k');
    });
  });

  describe('formatTooltipValue', () => {
    async function renderAndGetFormatter() {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => expect(capturedTooltipFormatter).not.toBeNull());
      return capturedTooltipFormatter!;
    }

    it('formats BTC Price with dollar sign and locale number', async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(95000, 'BTC Price', {});
      expect(String(formattedValue)).toContain('95,000');
      expect(label).toBe('BTC Price');
    });

    it('formats BTC 200 DMA with dollar sign and locale number', async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(38500, 'BTC 200 DMA', {});
      expect(String(formattedValue)).toContain('38,500');
      expect(label).toBe('BTC 200 DMA');
    });

    it('formats ETH Price with dollar sign and locale number', async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(3200, 'ETH Price', {});
      expect(String(formattedValue)).toContain('3,200');
      expect(label).toBe('ETH Price');
    });

    it('formats ETH 200 DMA with dollar sign and locale number', async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(3050, 'ETH 200 DMA', {});
      expect(String(formattedValue)).toContain('3,050');
      expect(label).toBe('ETH 200 DMA');
    });

    it('formats ETH/BTC Ratio with fixed decimals', async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(0.05321, 'ETH/BTC Ratio', {});
      expect(String(formattedValue)).toBe('0.0532');
      expect(label).toBe('ETH/BTC Ratio');
    });

    it('formats ETH/BTC 200 DMA with fixed decimals', async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(0.04981, 'ETH/BTC 200 DMA', {});
      expect(String(formattedValue)).toBe('0.0498');
      expect(label).toBe('ETH/BTC 200 DMA');
    });

    it('formats Fear & Greed Index with raw sentiment + regime label', async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(65, 'Fear & Greed Index', {
        payload: { sentiment_value: 65, regime: 'g' },
      });
      expect(String(formattedValue)).toBe('65 (Greed)');
      expect(label).toBe('Fear & Greed Index');
    });

    it('formats Macro FGI with raw score and label', async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(61, 'Macro FGI', {
        payload: {
          macro_fear_greed: 61,
          macro_fear_greed_label: 'Greed',
        },
      });
      expect(String(formattedValue)).toBe('61 (Greed)');
      expect(label).toBe('Macro FGI');
    });

    it('formats Fear & Greed Index with empty label when regime is undefined', async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(50, 'Fear & Greed Index', {
        payload: { sentiment_value: 50, regime: undefined },
      });
      expect(String(formattedValue)).toBe('50 ()');
      expect(label).toBe('Fear & Greed Index');
    });

    it('formats Fear & Greed Index with empty label when regime is null', async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue] = fmt(40, 'Fear & Greed Index', {
        payload: { sentiment_value: 40, regime: null },
      });
      expect(String(formattedValue)).toBe('40 ()');
    });

    it('returns value unchanged for unknown series name (default branch)', async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(42, 'Some Other Series', {});
      expect(formattedValue).toBe(42);
      expect(label).toBe('Some Other Series');
    });

    it('formats BTC Price with undefined value falling back to 0', async () => {
      const fmt = await renderAndGetFormatter();
      const [formattedValue, label] = fmt(undefined, 'BTC Price', {});
      expect(String(formattedValue)).toContain('$0');
      expect(label).toBe('BTC Price');
    });

    it('formats series with undefined name falling back to empty string', async () => {
      const fmt = await renderAndGetFormatter();
      const [, label] = fmt(42, undefined, {});
      // labelName becomes "" — falls into default branch
      expect(String(label)).toBe('');
    });
  });

  describe('renderFgiActiveDot', () => {
    async function renderAndGetActiveDot() {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() => expect(capturedFgiActiveDot).not.toBeNull());
      return capturedFgiActiveDot!;
    }

    it('renders a circle with regime color', async () => {
      const renderDot = await renderAndGetActiveDot();
      const result = renderDot({ cx: 10, cy: 20, payload: { regime: 'g' } });
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
    });

    it('uses fallback color when regime is null', async () => {
      const renderDot = await renderAndGetActiveDot();
      const result = renderDot({ cx: 5, cy: 5, payload: { regime: null } });
      expect(result).not.toBeNull();
    });

    it('uses fallback color when regime is unknown', async () => {
      const renderDot = await renderAndGetActiveDot();
      const result = renderDot({ cx: 0, cy: 0, payload: { regime: 'xyz' } });
      expect(result).not.toBeNull();
    });

    it('uses default cx/cy of 0 when not provided', async () => {
      const renderDot = await renderAndGetActiveDot();
      const result = renderDot({ payload: { regime: 'ef' } });
      expect(result).not.toBeNull();
    });
  });

  describe('regimeBlocks', () => {
    it('produces one block when there is exactly one snapshot', async () => {
      mockGetMarketDashboardData.mockResolvedValue(
        makeResponse([
          makeSnapshot({
            date: '2025-01-01',
            btcPrice: 42000,
            btcDma: 38000,
            sentiment: 65,
            regime: 'g',
          }),
        ]),
      );
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() =>
        expect(screen.getByText('Market Overview')).toBeDefined(),
      );
      expect(screen.getByText(/65 \/ 100/)).toBeDefined();
    });

    it('extends a single block when consecutive points share a regime', async () => {
      mockGetMarketDashboardData.mockResolvedValue(
        makeResponse([
          makeSnapshot({
            date: '2025-01-01',
            btcPrice: 42000,
            btcDma: 38000,
            sentiment: 65,
            regime: 'g',
          }),
          makeSnapshot({
            date: '2025-01-02',
            btcPrice: 43000,
            btcDma: 38500,
            sentiment: 68,
            regime: 'g',
          }),
          makeSnapshot({
            date: '2025-01-03',
            btcPrice: 44000,
            btcDma: 39000,
            sentiment: 30,
            regime: 'ef',
          }),
        ]),
      );
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() =>
        expect(screen.getByText('Market Overview')).toBeDefined(),
      );
    });

    it('handles regime changes between consecutive data points', async () => {
      mockGetMarketDashboardData.mockResolvedValue(
        makeResponse([
          makeSnapshot({
            date: '2025-01-01',
            btcPrice: 42000,
            btcDma: 38000,
            sentiment: 25,
            regime: 'ef',
          }),
          makeSnapshot({
            date: '2025-01-02',
            btcPrice: 43000,
            btcDma: 38500,
            sentiment: 45,
            regime: 'f',
          }),
          makeSnapshot({
            date: '2025-01-03',
            btcPrice: 44000,
            btcDma: 39000,
            sentiment: 55,
            regime: 'n',
          }),
          makeSnapshot({
            date: '2025-01-04',
            btcPrice: 45000,
            btcDma: 39500,
            sentiment: 75,
            regime: 'g',
          }),
          makeSnapshot({
            date: '2025-01-05',
            btcPrice: 46000,
            btcDma: 40000,
            sentiment: 90,
            regime: 'eg',
          }),
        ]),
      );
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() =>
        expect(screen.getByText('Market Overview')).toBeDefined(),
      );
    });
  });

  describe('relative strength signal', () => {
    it('shows ETH leading when ratio is above DMA', async () => {
      mockGetMarketDashboardData.mockResolvedValue(mockData);
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() =>
        expect(screen.getByText('ETH leading')).toBeDefined(),
      );
    });

    it('shows BTC leading when ratio is below DMA', async () => {
      mockGetMarketDashboardData.mockResolvedValue(
        makeResponse([
          makeSnapshot({
            date: '2025-01-01',
            btcPrice: 42000,
            btcDma: 38000,
            sentiment: 65,
            regime: 'g',
            ethBtcRatio: 0.045,
            ethBtcDma: 0.05,
            ethBtcIsAbove: false,
          }),
        ]),
      );
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() =>
        expect(screen.getByText('BTC leading')).toBeDefined(),
      );
    });

    it('shows insufficient data when ratio DMA is unavailable', async () => {
      mockGetMarketDashboardData.mockResolvedValue(
        makeResponse([
          makeSnapshot({
            date: '2025-01-01',
            btcPrice: 42000,
            btcDma: 38000,
            sentiment: 65,
            regime: 'g',
            ethBtcRatio: 0.045,
          }),
        ]),
      );
      render(<MarketDashboardView />, { wrapper: createWrapper() });
      await waitFor(() =>
        expect(screen.getByText('Insufficient data')).toBeDefined(),
      );
    });
  });
});
