import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BacktestTooltip } from '@/components/wallet/portfolio/views/backtesting/components/BacktestTooltip';
import { buildBacktestTooltipData } from '@/components/wallet/portfolio/views/backtesting/utils/backtestTooltipDataUtils';

import { render, screen } from '../../../../../../../test-utils';

vi.mock(
  '@/components/wallet/portfolio/views/backtesting/utils/backtestTooltipDataUtils',
  () => ({
    buildBacktestTooltipData: vi.fn(),
  }),
);

vi.mock(
  '@/components/wallet/portfolio/views/backtesting/components/BacktestAllocationBar',
  () => ({
    BacktestAllocationBar: (props: {
      strategyId?: string;
      displayName: string;
    }) => (
      <div data-testid={`allocation-${props.strategyId ?? 'default'}`}>
        {props.displayName}
      </div>
    ),
  }),
);

const mockedBuildBacktestTooltipData = vi.mocked(buildBacktestTooltipData);

function createTooltipData(overrides: Record<string, unknown> = {}) {
  return {
    dateStr: '1/15/2025',
    sections: {
      strategies: [],
      events: [],
      signals: [],
      details: [],
      allocations: [],
    },
    ...overrides,
  };
}

describe('BacktestTooltip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when inactive or when the build helper has no data', () => {
    mockedBuildBacktestTooltipData.mockReturnValue(null);

    const { rerender } = render(
      <BacktestTooltip active={false} payload={[]} label="" />,
    );
    expect(screen.queryByText(/Signals/i)).not.toBeInTheDocument();

    rerender(<BacktestTooltip active={true} payload={[]} label="" />);
    expect(screen.queryByText(/Signals/i)).not.toBeInTheDocument();
  });

  it('renders date, strategy rows, and events', () => {
    mockedBuildBacktestTooltipData.mockReturnValue(
      createTooltipData({
        sections: {
          strategies: [{ name: 'AWP', value: 10000, color: '#3b82f6' }],
          events: [
            {
              name: 'Buy Spot',
              strategies: ['AWP'],
              color: '#22c55e',
            },
          ],
          signals: [],
          details: [],
          allocations: [],
        },
      }) as ReturnType<typeof buildBacktestTooltipData>,
    );

    render(<BacktestTooltip active={true} payload={[]} label="" />);

    expect(screen.getByText('1/15/2025')).toBeInTheDocument();
    expect(screen.getByText(/AWP: \$10,000/)).toBeInTheDocument();
    expect(screen.getByText('Buy Spot (AWP)')).toBeInTheDocument();
  });

  it('renders signals and decision details sections when present', () => {
    mockedBuildBacktestTooltipData.mockReturnValue(
      createTooltipData({
        sections: {
          strategies: [],
          events: [],
          signals: [{ name: 'Trend', value: 'UP', color: '#10b981' }],
          details: [
            {
              name: 'DMA Gated FGI Default decision',
              value: 'buy · below_extreme_fear_buy',
              color: '#cbd5e1',
            },
          ],
          allocations: [],
        },
      }) as ReturnType<typeof buildBacktestTooltipData>,
    );

    render(<BacktestTooltip active={true} payload={[]} label="" />);

    expect(screen.getByText('Signals')).toBeInTheDocument();
    expect(screen.getByText('Trend')).toBeInTheDocument();
    expect(screen.getByText('UP')).toBeInTheDocument();
    expect(screen.getByText('Decision')).toBeInTheDocument();
    expect(
      screen.getByText('DMA Gated FGI Default decision'),
    ).toBeInTheDocument();
  });

  it('renders allocation blocks when present', () => {
    mockedBuildBacktestTooltipData.mockReturnValue(
      createTooltipData({
        sections: {
          strategies: [],
          events: [],
          signals: [],
          details: [],
          allocations: [
            {
              id: 'dca_classic',
              displayName: 'DCA Classic',
              allocation: { spot: 0.5, stable: 0.5 },
              index: 0,
            },
            {
              id: 'dma_gated_fgi_default',
              displayName: 'DMA Gated FGI Default',
              allocation: { spot: 0.8, stable: 0.2 },
              index: 1,
            },
          ],
        },
      }) as ReturnType<typeof buildBacktestTooltipData>,
    );

    const { container } = render(
      <BacktestTooltip active={true} payload={[]} label="" />,
    );

    expect(screen.getByTestId('allocation-dca_classic')).toBeInTheDocument();
    expect(
      screen.getByTestId('allocation-dma_gated_fgi_default'),
    ).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('min-w-[200px]');
    expect(container.firstChild).not.toHaveClass('overflow-y-auto');
  });
});
