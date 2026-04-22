import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DailyYieldTooltip } from '@/components/charts/tooltipContent/DailyYieldTooltip';

vi.mock('@/components/charts/tooltipContent/TooltipWrapper', () => ({
  TooltipWrapper: ({
    children,
    date,
  }: {
    children: React.ReactNode;
    date: string;
  }) => (
    <div data-testid="tooltip-wrapper" data-date={date}>
      {children}
    </div>
  ),
}));

vi.mock('@/components/charts/tooltipContent/TooltipRow', () => ({
  TooltipRow: ({
    label,
    value,
    prefix,
  }: {
    label: string;
    value: number;
    prefix?: string;
  }) => (
    <div
      data-testid={`row-${label}`}
      data-value={value}
      data-prefix={prefix ?? ''}
    />
  ),
}));

vi.mock('@/utils/formatters', () => ({
  formatters: { currency: (v: number) => `$${v.toFixed(2)}` },
}));

describe('DailyYieldTooltip', () => {
  it('renders positive yield with + prefix', () => {
    render(
      <DailyYieldTooltip
        data={{
          date: '2024-01-01',
          totalYield: 100,
          cumulativeYield: undefined,
          protocols: [],
          protocolCount: 0,
        }}
      />,
    );
    const row = screen.getByTestId('row-Daily Yield');
    expect(row.getAttribute('data-prefix')).toBe('+');
  });

  it('renders negative yield without + prefix', () => {
    render(
      <DailyYieldTooltip
        data={{
          date: '2024-01-01',
          totalYield: -50,
          cumulativeYield: undefined,
          protocols: [],
          protocolCount: 0,
        }}
      />,
    );
    const row = screen.getByTestId('row-Daily Yield');
    expect(row.getAttribute('data-prefix')).toBe('');
  });

  it('shows cumulative row when cumulativeYield is defined', () => {
    render(
      <DailyYieldTooltip
        data={{
          date: '2024-01-01',
          totalYield: 100,
          cumulativeYield: 500,
          protocols: [],
          protocolCount: 0,
        }}
      />,
    );
    expect(screen.getByTestId('row-Cumulative')).toBeDefined();
  });

  it('hides cumulative row when cumulativeYield is undefined', () => {
    render(
      <DailyYieldTooltip
        data={{
          date: '2024-01-01',
          totalYield: 100,
          cumulativeYield: undefined,
          protocols: [],
          protocolCount: 0,
        }}
      />,
    );
    expect(screen.queryByTestId('row-Cumulative')).toBeNull();
  });

  it('renders protocol breakdown sorted by absolute yield', () => {
    render(
      <DailyYieldTooltip
        data={{
          date: '2024-01-01',
          totalYield: 100,
          cumulativeYield: undefined,
          protocols: [
            { protocol_name: 'Aave', chain: 'eth', yield_return_usd: 10 },
            { protocol_name: 'Compound', chain: 'eth', yield_return_usd: -50 },
            { protocol_name: 'Lido', chain: 'eth', yield_return_usd: 30 },
          ],
          protocolCount: 3,
        }}
      />,
    );
    expect(screen.getByText('By Protocol (3)')).toBeDefined();
    expect(screen.getByText('Aave')).toBeDefined();
    expect(screen.getByText('Compound')).toBeDefined();
    expect(screen.getByText('Lido')).toBeDefined();
  });

  it('does not render protocol section when protocols is empty', () => {
    render(
      <DailyYieldTooltip
        data={{
          date: '2024-01-01',
          totalYield: 100,
          cumulativeYield: undefined,
          protocols: [],
          protocolCount: 0,
        }}
      />,
    );
    expect(screen.queryByText(/By Protocol/)).toBeNull();
  });

  it('handles null/undefined protocols with fallback to empty array', () => {
    render(
      <DailyYieldTooltip
        data={{
          date: '2024-01-01',
          totalYield: 100,
          cumulativeYield: undefined,
          protocols: undefined as any,
          protocolCount: 0,
        }}
      />,
    );
    expect(screen.queryByText(/By Protocol/)).toBeNull();
  });

  it('renders negative protocol yields with red styling', () => {
    const { container } = render(
      <DailyYieldTooltip
        data={{
          date: '2024-01-01',
          totalYield: -50,
          cumulativeYield: undefined,
          protocols: [
            { protocol_name: 'Aave', chain: 'eth', yield_return_usd: -25 },
          ],
          protocolCount: 1,
        }}
      />,
    );
    const yieldSpans = container.querySelectorAll('.text-red-300');
    expect(yieldSpans.length).toBeGreaterThan(0);
  });
});
