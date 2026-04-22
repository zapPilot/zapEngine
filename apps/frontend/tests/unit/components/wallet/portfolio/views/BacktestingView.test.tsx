import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BacktestingView } from '@/components/wallet/portfolio/views/BacktestingView';
import { useBacktestMutation } from '@/hooks/mutations/useBacktestMutation';
import * as backtestingService from '@/services/backtestingService';
import * as strategyService from '@/services/strategyService';

import { render } from '../../../../../test-utils';

vi.mock('@/hooks/mutations/useBacktestMutation', () => ({
  useBacktestMutation: vi.fn(),
}));

vi.mock('@/services/backtestingService', () => ({
  getBacktestingStrategiesV3: vi.fn(),
  runBacktest: vi.fn(),
}));

vi.mock('@/services/strategyService', () => ({
  getStrategyConfigs: vi.fn(),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  ComposedChart: ({ children }: any) => (
    <div data-testid="composed-chart">{children}</div>
  ),
  Area: () => null,
  Scatter: () => null,
  Line: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: vi.fn(
      ({
        children,
        ...props
      }: {
        children: React.ReactNode;
        [key: string]: any;
      }) => <div {...props}>{children}</div>,
    ),
  },
}));

const mockBacktestData = {
  strategies: {
    dca_classic: {
      strategy_id: 'dca_classic',
      display_name: 'DCA Classic',
      total_invested: 10000,
      final_value: 10500,
      roi_percent: 5.2,
      trade_count: 0,
      final_allocation: {
        spot: 0.5,
        stable: 0.5,
      },
      parameters: {},
    },
    dma_gated_fgi_default: {
      strategy_id: 'dma_gated_fgi',
      display_name: 'DMA Gated FGI Default',
      signal_id: 'dma_gated_fgi',
      total_invested: 10000,
      final_value: 12000,
      roi_percent: 15.5,
      calmar_ratio: 1.24,
      max_drawdown_percent: -12.3,
      trade_count: 5,
      final_allocation: {
        spot: 0.6,
        stable: 0.4,
      },
      parameters: {},
    },
  },
  timeline: [
    {
      market: {
        date: '2024-01-01',
        token_price: { btc: 40000 },
        sentiment: 50,
        sentiment_label: 'neutral',
      },
      strategies: {
        dca_classic: {
          portfolio: {
            spot_usd: 5000,
            stable_usd: 5000,
            total_value: 10000,
            allocation: {
              spot: 0.5,
              stable: 0.5,
            },
          },
          signal: null,
          decision: {
            action: 'hold',
            reason: 'baseline_dca',
            rule_group: 'none',
            target_allocation: {
              spot: 0.5,
              stable: 0.5,
            },
            immediate: false,
          },
          execution: {
            event: null,
            transfers: [],
            blocked_reason: null,
            step_count: 0,
            steps_remaining: 0,
            interval_days: 0,
          },
        },
        dma_gated_fgi_default: {
          portfolio: {
            spot_usd: 6000,
            stable_usd: 4000,
            total_value: 10000,
            allocation: {
              spot: 0.6,
              stable: 0.4,
            },
          },
          signal: {
            id: 'dma_gated_fgi',
            regime: 'neutral',
            raw_value: 50,
            confidence: 1,
            details: {
              dma: {
                dma_200: 39500,
                distance: 0.01,
                zone: 'above',
                cross_event: null,
                cooldown_active: false,
                cooldown_remaining_days: 0,
                cooldown_blocked_zone: null,
                fgi_slope: 1,
              },
            },
          },
          decision: {
            action: 'buy',
            reason: 'below_extreme_fear_buy',
            rule_group: 'dma_fgi',
            target_allocation: {
              spot: 0.6,
              stable: 0.4,
            },
            immediate: false,
          },
          execution: {
            event: 'rebalance',
            transfers: [
              {
                from_bucket: 'stable',
                to_bucket: 'spot',
                amount_usd: 250,
              },
            ],
            blocked_reason: null,
            step_count: 1,
            steps_remaining: 2,
            interval_days: 3,
          },
        },
      },
    },
  ],
};

describe('BacktestingView', () => {
  let mockMutate: ReturnType<typeof vi.fn>;
  let defaultMock: {
    mutate: ReturnType<typeof vi.fn>;
    data: null;
    isPending: boolean;
    error: null;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate = vi.fn(
      (
        variables: unknown,
        options?: { onSettled?: (...args: unknown[]) => void },
      ) => {
        options?.onSettled?.(undefined, null, variables, undefined);
      },
    );
    defaultMock = {
      mutate: mockMutate,
      data: null,
      isPending: false,
      error: null,
    };
    vi.mocked(useBacktestMutation).mockReturnValue(defaultMock as any);
    vi.mocked(backtestingService.getBacktestingStrategiesV3).mockResolvedValue({
      catalog_version: '2.0.0',
      strategies: [],
    });
    vi.mocked(strategyService.getStrategyConfigs).mockResolvedValue({
      strategies: [],
      presets: [],
      backtest_defaults: { days: 500, total_capital: 10000 },
    });
  });

  it('renders heading and description', async () => {
    await act(async () => {
      render(<BacktestingView />);
    });

    expect(screen.getByText('Strategy Simulator')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Compare Normal DCA vs Regime-Based Strategy performance over time/,
      ),
    ).toBeInTheDocument();
  });

  it('shows the loading skeleton while defaults are still bootstrapping', () => {
    vi.mocked(backtestingService.getBacktestingStrategiesV3).mockImplementation(
      () => new Promise(() => undefined),
    );
    vi.mocked(strategyService.getStrategyConfigs).mockImplementation(
      () => new Promise(() => undefined),
    );

    render(<BacktestingView />);

    expect(
      screen.getByRole('status', {
        name: /Running backtest simulation/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Ready to Compare Strategies'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /Click "Run Backtest" to see how the Zap Pilot regime-based strategy compares to normal DCA\./,
      ),
    ).not.toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('auto-runs once after defaults resolve', async () => {
    await act(async () => {
      render(<BacktestingView />);
    });

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });
  });

  it('shows loading state when pending', async () => {
    vi.mocked(useBacktestMutation).mockReturnValue({
      ...defaultMock,
      isPending: true,
    } as any);

    await act(async () => {
      render(<BacktestingView />);
    });

    expect(
      screen.getByRole('status', {
        name: /Running backtest simulation/i,
      }),
    ).toBeInTheDocument();
  });

  it('displays API error messages', async () => {
    vi.mocked(useBacktestMutation).mockReturnValue({
      ...defaultMock,
      error: new Error('Test API Error'),
    } as any);

    await act(async () => {
      render(<BacktestingView />);
    });

    expect(screen.getByText('Test API Error')).toBeInTheDocument();
  });

  it('displays a generic message for non-Error failures', async () => {
    vi.mocked(useBacktestMutation).mockReturnValue({
      ...defaultMock,
      error: 'unexpected failure',
    } as any);

    await act(async () => {
      render(<BacktestingView />);
    });

    expect(screen.getByText('Failed to run backtest')).toBeInTheDocument();
  });

  it('renders DMA-first result metrics and chart', async () => {
    vi.mocked(useBacktestMutation).mockReturnValue({
      ...defaultMock,
      data: mockBacktestData,
    } as any);

    await act(async () => {
      render(<BacktestingView />);
    });

    expect(screen.getByText('ROI')).toBeInTheDocument();
    expect(screen.getByText('+15.5%')).toBeInTheDocument();
    expect(screen.getByText('CALMAR')).toBeInTheDocument();
    expect(screen.getByText('1.24')).toBeInTheDocument();
    expect(screen.getByText('MAX DRAWDOWN')).toBeInTheDocument();
    expect(screen.getByText('12.3%')).toBeInTheDocument();
    expect(screen.getByTestId('composed-chart')).toBeInTheDocument();
  });

  it('renders the days input and run button when data is present', async () => {
    vi.mocked(useBacktestMutation).mockReturnValue({
      ...defaultMock,
      data: mockBacktestData,
    } as any);

    await act(async () => {
      render(<BacktestingView />);
    });

    expect(screen.getByDisplayValue('500')).toHaveAttribute('type', 'number');
    expect(screen.getByText('[RUN]')).toBeInTheDocument();
  });
});
