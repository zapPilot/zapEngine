import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BacktestTerminalDisplay } from '@/components/wallet/portfolio/views/backtesting/components/BacktestTerminalDisplay';
import type { BacktestResponse } from '@/types/backtesting';
import type { StrategyConfigsResponse } from '@/types/strategy';

vi.mock('@/components/wallet/portfolio/views/backtesting/constants', () => ({
  DEFAULT_DAYS: 500,
  DEFAULT_TOTAL_CAPITAL: 10000,
  DMA_GATED_FGI_STRATEGY_ID: 'dma_gated_fgi',
  FIXED_PACING_ENGINE_ID: 'fgi_exponential',
  getDefaultConfigIdForStrategyId: (strategyId: string) => strategyId,
}));

vi.mock(
  '@/components/wallet/portfolio/views/backtesting/utils/chartHelpers',
  () => ({
    getPrimaryStrategyId: vi.fn((ids: string[]) => ids[0] || null),
  }),
);

vi.mock(
  '@/components/wallet/portfolio/views/backtesting/utils/jsonConfigurationHelpers',
  () => ({
    parseJsonField: vi.fn(
      (_json: string, _field: string, fallback: number) => fallback,
    ),
    updateJsonField: vi.fn(
      (_json: string, _field: string, value: number) => `{"days":${value}}`,
    ),
    parseConfigStrategyId: vi.fn((_json: string, fallback: string) => fallback),
    updateConfigStrategy: vi.fn(
      (_json: string, config: Record<string, unknown>) =>
        JSON.stringify({ configs: [config] }),
    ),
  }),
);

vi.mock(
  '@/components/wallet/portfolio/views/backtesting/components/BacktestChart',
  () => ({
    BacktestChart: () => <div data-testid="backtest-chart" />,
  }),
);

vi.mock(
  '@/components/wallet/portfolio/views/backtesting/components/backtestTerminalMetrics',
  () => ({
    createHeroMetrics: vi.fn((strategy) =>
      strategy
        ? [
            {
              label: 'ROI',
              value: '+25.5%',
              bar: '████████',
              color: 'text-emerald-400',
            },
            {
              label: 'CALMAR',
              value: '1.24',
              bar: '██████',
              color: 'text-cyan-400',
            },
            {
              label: 'MAX DRAWDOWN',
              value: '12.3%',
              bar: '█████',
              color: 'text-rose-400',
            },
          ]
        : [],
    ),
    formatTradeFrequency: vi.fn((tradeCount: number, actualDays: number) => {
      if (tradeCount <= 0 || actualDays <= 0) return null;
      const daysPerTrade = Math.round(actualDays / tradeCount);
      if (daysPerTrade <= 1) return '1+ trades per day';
      return `1 trade every ${daysPerTrade} days`;
    }),
  }),
);

vi.mock('@/hooks/ui/useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

describe('BacktestTerminalDisplay', () => {
  const mockOnRun = vi.fn();
  const mockOnEditorValueChange = vi.fn();

  const defaultProps = {
    summary: null,
    sortedStrategyIds: [],
    actualDays: 500,
    chartData: [],
    yAxisDomain: [0, 100] as [number, number],
    isPending: false,
    onRun: mockOnRun,
    editorValue: '{"days":500}',
    onEditorValueChange: mockOnEditorValueChange,
    strategyConfigs: null,
    days: 500,
    selectedStrategyId: 'dma_gated_fgi',
    strategyOptions: [],
  };

  const mockSummary: { strategies: BacktestResponse['strategies'] } = {
    strategies: {
      dma_gated_fgi_default: {
        strategy_id: 'dma_gated_fgi',
        display_name: 'DMA Gated FGI Default',
        signal_id: 'dma_gated_fgi',
        total_invested: 10000,
        final_value: 12550,
        roi_percent: 25.5,
        trade_count: 12,
        final_allocation: {
          spot: 0.8,
          stable: 0.2,
        },
        parameters: {},
      },
    },
  };

  const mockStrategyConfigs: StrategyConfigsResponse = {
    strategies: [
      {
        strategy_id: 'dma_gated_fgi',
        display_name: 'DMA Gated FGI',
        description: 'DMA-first strategy',
        param_schema: {},
        default_params: { pacing: { k: 3 } },
        supports_daily_suggestion: true,
      },
      {
        strategy_id: 'momentum_alpha',
        display_name: 'Momentum Alpha',
        description: 'Momentum strategy',
        param_schema: {},
        default_params: {},
        supports_daily_suggestion: false,
      },
    ],
    presets: [],
    backtest_defaults: {
      days: 500,
      total_capital: 10000,
    },
  };

  it('renders command prompt controls', () => {
    render(<BacktestTerminalDisplay {...defaultProps} />);

    expect(screen.getByText('$')).toBeDefined();
    expect(screen.getByText('backtest')).toBeDefined();
    expect(screen.getByText('--days')).toBeDefined();
    expect(screen.getByText('--strategy')).toBeDefined();
    expect(screen.getByText('dma_gated_fgi')).toBeDefined();
    expect(screen.getByText('--pacing')).toBeDefined();
    expect(screen.getByText('fgi_exponential')).toBeDefined();
    expect(screen.getByRole('button', { name: /RUN/i })).toBeDefined();
  });

  it('shows pending state in the run button', () => {
    render(<BacktestTerminalDisplay {...defaultProps} isPending={true} />);

    const button = screen.getByRole('button', { name: '[...]' });
    expect(button.textContent).toBe('[...]');
    expect(button.getAttribute('disabled')).not.toBeNull();
  });

  it('calls onRun when run button is clicked', () => {
    render(<BacktestTerminalDisplay {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /RUN/i }));

    expect(mockOnRun).toHaveBeenCalledOnce();
  });

  it('updates days via updateJsonField', async () => {
    const { updateJsonField } =
      await import('@/components/wallet/portfolio/views/backtesting/utils/jsonConfigurationHelpers');

    render(<BacktestTerminalDisplay {...defaultProps} />);

    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '365' },
    });

    expect(updateJsonField).toHaveBeenCalledWith('{"days":500}', 'days', 365);
    expect(mockOnEditorValueChange).toHaveBeenCalledWith('{"days":365}');
  });

  it('renders static strategy label when strategy configs are null', () => {
    render(<BacktestTerminalDisplay {...defaultProps} />);

    expect(screen.queryByRole('button', { name: /dma_gated_fgi/i })).toBeNull();
    expect(screen.getByText('dma_gated_fgi')).toBeDefined();
  });

  it('renders a dropdown when strategy configs include multiple strategies', () => {
    const strategyOptions = [
      { value: 'dma_gated_fgi', label: 'DMA Gated FGI' },
      { value: 'momentum_alpha', label: 'Momentum Alpha' },
    ];
    render(
      <BacktestTerminalDisplay
        {...defaultProps}
        strategyConfigs={mockStrategyConfigs}
        strategyOptions={strategyOptions}
      />,
    );

    const dropdownTrigger = screen.getByRole('button', {
      name: /DMA Gated FGI/i,
    });
    expect(dropdownTrigger).toBeDefined();
  });

  it('shows hero metrics for the primary non-DCA strategy', () => {
    render(
      <BacktestTerminalDisplay
        {...defaultProps}
        summary={mockSummary}
        sortedStrategyIds={['dma_gated_fgi_default']}
      />,
    );

    expect(screen.getByText('ROI')).toBeDefined();
    expect(screen.getByText('+25.5%')).toBeDefined();
    expect(screen.getByText('CALMAR')).toBeDefined();
    expect(screen.getByText('1.24')).toBeDefined();
    expect(screen.getByText('MAX DRAWDOWN')).toBeDefined();
    expect(screen.getByText('12.3%')).toBeDefined();
  });

  it('shows the chart only when chart data exists', () => {
    const chartData = [
      { date: '2024-01-01', dma_gated_fgi_default_value: 100 },
      { date: '2024-01-02', dma_gated_fgi_default_value: 105 },
    ];

    const { rerender } = render(
      <BacktestTerminalDisplay {...defaultProps} chartData={chartData} />,
    );

    expect(screen.getByTestId('backtest-chart')).toBeDefined();

    rerender(<BacktestTerminalDisplay {...defaultProps} chartData={[]} />);

    expect(screen.queryByTestId('backtest-chart')).toBeNull();
  });

  it('shows trade frequency when summary data is available', () => {
    render(
      <BacktestTerminalDisplay
        {...defaultProps}
        summary={mockSummary}
        sortedStrategyIds={['dma_gated_fgi_default']}
        actualDays={500}
      />,
    );

    // 500 days / 12 trades ≈ 42 days
    expect(screen.getByText(/1 trade every 42 days/)).toBeDefined();
  });

  it('hides trade frequency when no summary data exists', () => {
    render(<BacktestTerminalDisplay {...defaultProps} />);

    expect(screen.queryByText(/trade every/)).toBeNull();
  });
});
