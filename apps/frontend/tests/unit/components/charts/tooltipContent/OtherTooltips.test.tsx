import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DailyYieldTooltip } from '@/components/charts/tooltipContent/DailyYieldTooltip';
import { DrawdownTooltip } from '@/components/charts/tooltipContent/DrawdownTooltip';
import { PerformanceTooltip } from '@/components/charts/tooltipContent/PerformanceTooltip';
import { SharpeTooltip } from '@/components/charts/tooltipContent/SharpeTooltip';
import { VolatilityTooltip } from '@/components/charts/tooltipContent/VolatilityTooltip';

// Mock TooltipWrapper and TooltipRow
vi.mock('@/components/charts/tooltipContent/TooltipWrapper', () => ({
  TooltipWrapper: ({ children, date }: any) => (
    <div data-testid="tooltip-wrapper" data-date={date}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/charts/tooltipContent/TooltipRow', () => ({
  TooltipRow: ({ label, value, format, prefix }: any) => (
    <div
      data-testid="tooltip-row"
      data-label={label}
      data-value={value}
      data-format={format}
      data-prefix={prefix}
    />
  ),
}));

// Mock Utils
vi.mock('@/utils/chartHoverUtils', () => ({
  getDrawdownSeverity: (_val: number) => 'Moderate',
  getDrawdownSeverityColor: (_sev: string) => ({
    bgColor: 'bg-test',
    color: 'text-test',
  }),
  getSharpeInterpretation: (_val: number) => 'Good',
  getSharpeColor: (_val: number) => '#00ff00',
  getVolatilityRiskLevel: (_val: number) => 'High',
  getVolatilityRiskColor: (_level: string) => ({
    bgColor: 'bg-risk',
    color: 'text-risk',
  }),
  calculateDailyVolatility: (val: number) => val / 19.1,
}));

vi.mock('@/utils/formatters', () => ({
  formatters: {
    currency: (val: number) => `FMT_CURR_${val}`,
    percent: (val: number) => `FMT_PERC_${val}`,
  },
}));

describe('Other Tooltips', () => {
  describe('PerformanceTooltip', () => {
    const mockData = {
      chartType: 'performance' as const,
      date: '2024-01-01',
      x: 0,
      y: 0,
      value: 1000,
      benchmark: 800,
    };

    it('should render portfolio value', () => {
      render(<PerformanceTooltip data={mockData} />);
      const rows = screen.getAllByTestId('tooltip-row');
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveAttribute('data-label', 'Portfolio Value');
      expect(rows[0]).toHaveAttribute('data-value', '1000');
    });
  });

  describe('DrawdownTooltip', () => {
    const mockData = {
      chartType: 'drawdown-recovery' as const,
      date: '2024-01-01',
      x: 0,
      y: 0,
      drawdown: -15,
      peakDate: '2023-01-01',
      distanceFromPeak: 365,
      recoveryDurationDays: 30,
      recoveryDepth: -20,
      isRecoveryPoint: false,
    };

    it('should render drawdown row and severity', () => {
      render(<DrawdownTooltip data={mockData} />);
      const rows = screen.getAllByTestId('tooltip-row');
      expect(rows[0]).toHaveAttribute('data-label', 'Drawdown');
      expect(rows[0]).toHaveAttribute('data-value', 'FMT_PERC_-15');

      expect(screen.getByText('Severity')).toBeInTheDocument();
      expect(screen.getByText('Moderate')).toBeInTheDocument();
    });

    it('should render details when provided', () => {
      render(<DrawdownTooltip data={mockData} />);
      const rows = screen.getAllByTestId('tooltip-row');
      const labels = rows.map((r) => r.getAttribute('data-label'));
      expect(labels).toContain('Peak Date');
      expect(labels).toContain('Days from Peak');
      expect(labels).toContain('Recovery Time');
      expect(labels).toContain('Cycle Depth');
    });
  });

  describe('SharpeTooltip', () => {
    const mockData = {
      chartType: 'sharpe' as const,
      date: '2024-01-01',
      x: 0,
      y: 0,
      sharpe: 2.5,
      interpretation: 'Good' as const,
    };

    it('should render sharpe ratio and rating', () => {
      render(<SharpeTooltip data={mockData} />);
      expect(screen.getByText('Sharpe Ratio')).toBeInTheDocument();
      expect(screen.getByText('2.50')).toBeInTheDocument();

      const row = screen.getByTestId('tooltip-row');
      expect(row).toHaveAttribute('data-label', 'Rating');
      expect(row).toHaveAttribute('data-value', 'Good');
    });
  });

  describe('VolatilityTooltip', () => {
    const mockData = {
      chartType: 'volatility' as const,
      date: '2024-01-01',
      x: 0,
      y: 0,
      volatility: 30,
    };

    it('should render annualized and daily vol', () => {
      render(<VolatilityTooltip data={mockData} />);
      const rows = screen.getAllByTestId('tooltip-row');

      expect(rows[0]).toHaveAttribute('data-label', 'Annualized Vol');
      expect(rows[0]).toHaveAttribute('data-value', '30'); // formatted string in real app, but prop passed is raw

      expect(rows[1]).toHaveAttribute('data-label', 'Daily Vol');
      // 30 / 19.1 = 1.57...
      // Wait, logic in component: calculateDailyVolatility(data.volatility) -> data.volatility / 19.1
      // My mock implementation: val / 19.1.
      // Test checks what is passed to value prop.
      const expectedDaily = 30 / 19.1;
      expect(parseFloat(rows[1].getAttribute('data-value')!)).toBeCloseTo(
        expectedDaily,
      );
    });

    it('should render risk level and warning if high risk', () => {
      render(<VolatilityTooltip data={mockData} />); // Vol 30 >= 25 is High Risk
      expect(screen.getByText('Risk Level')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText(/High volatility warning/)).toBeInTheDocument();
    });
  });

  describe('DailyYieldTooltip', () => {
    const mockData = {
      chartType: 'daily-yield' as const,
      date: '2024-01-01',
      x: 0,
      y: 0,
      totalYield: 100,
      cumulativeYield: 500,
      protocolCount: 2,
      protocols: [
        {
          protocol_id: 'p1',
          protocol_name: 'Protocol A',
          chain: 'ETH',
          yield_return_usd: 60,
        },
        {
          protocol_id: 'p2',
          protocol_name: 'Protocol B',
          chain: 'BSC',
          yield_return_usd: 40,
        },
      ],
    };

    it('should render daily and cumulative yield', () => {
      render(<DailyYieldTooltip data={mockData} />);
      const rows = screen.getAllByTestId('tooltip-row');

      expect(rows[0]).toHaveAttribute('data-label', 'Daily Yield');
      expect(rows[0]).toHaveAttribute('data-value', '100');
      expect(rows[0]).toHaveAttribute('data-prefix', '+');

      expect(rows[1]).toHaveAttribute('data-label', 'Cumulative');
      expect(rows[1]).toHaveAttribute('data-value', '500');
    });

    it('should render protocol list', () => {
      render(<DailyYieldTooltip data={mockData} />);
      expect(screen.getByText('By Protocol (2)')).toBeInTheDocument();
      expect(screen.getByText(/Protocol A/)).toBeInTheDocument();
      expect(screen.getByText(/Protocol B/)).toBeInTheDocument();
      // Text content includes '+' for positive yield
      expect(screen.getByText('+FMT_CURR_60')).toBeInTheDocument();
      expect(screen.getByText('+FMT_CURR_40')).toBeInTheDocument();
    });
  });
});
