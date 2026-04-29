import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BacktestAllocationBar } from '@/components/wallet/portfolio/views/backtesting/components/BacktestAllocationBar';
import { getStrategyColor } from '@/components/wallet/portfolio/views/backtesting/utils/strategyDisplay';

import { render, screen } from '../../../../../../../test-utils';

vi.mock(
  '@/components/wallet/portfolio/components/allocation',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/components/wallet/portfolio/components/allocation')
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
            (segment) =>
              `${segment.label}:${segment.percentage}:${segment.color.toLowerCase()}`,
          )
          .join('|')}
      </div>
    ),
  }),
);

vi.mock(
  '@/components/wallet/portfolio/views/backtesting/utils/strategyDisplay',
  () => ({
    getStrategyColor: vi.fn(() => '#ff0000'),
  }),
);

const mockedGetStrategyColor = vi.mocked(getStrategyColor);

function getRenderedSegments(testId: string) {
  const rendered = screen.getByTestId(testId);
  const rawSegments = rendered.getAttribute('data-segments');

  expect(rawSegments).toBeTruthy();

  return JSON.parse(rawSegments ?? '[]') as {
    label: string;
    percentage: number;
    color: string;
  }[];
}

describe('BacktestAllocationBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when all allocation buckets are zero', () => {
    render(
      <BacktestAllocationBar
        displayName="Test Strategy"
        allocation={{ btc: 0, eth: 0, spy: 0, stable: 0, alt: 0 }}
      />,
    );

    expect(screen.queryByText('Test Strategy')).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^backtest-/)).not.toBeInTheDocument();
  });

  it('renders display name and the mapped allocation segments', () => {
    render(
      <BacktestAllocationBar
        displayName="AWP Portfolio"
        allocation={{ btc: 0.6, eth: 0, spy: 0, stable: 0.4, alt: 0 }}
      />,
    );

    expect(screen.getByText('AWP Portfolio')).toBeInTheDocument();
    expect(screen.getByTestId('backtest-default')).toHaveTextContent(
      'BTC:60:#f7931a|STABLE:40:#2775ca',
    );
  });

  it('renders BTC labels with the shared amber chart color', () => {
    render(
      <BacktestAllocationBar
        displayName="BTC Rotation"
        allocation={{ btc: 0.75, eth: 0, spy: 0, stable: 0.25, alt: 0 }}
      />,
    );

    expect(screen.getByTestId('backtest-default')).toHaveTextContent(
      'BTC:75:#f7931a|STABLE:25:#2775ca',
    );
    expect(getRenderedSegments('backtest-default')[0]).toMatchObject({
      label: 'BTC',
      color: '#F7931A',
    });
  });

  it('renders ETH labels with the shared indigo chart color', () => {
    render(
      <BacktestAllocationBar
        displayName="ETH Rotation"
        allocation={{ btc: 0, eth: 0.75, spy: 0, stable: 0.25, alt: 0 }}
      />,
    );

    expect(screen.getByTestId('backtest-default')).toHaveTextContent(
      'ETH:75:#627eea|STABLE:25:#2775ca',
    );
    expect(getRenderedSegments('backtest-default')[0]).toMatchObject({
      label: 'ETH',
      color: '#627EEA',
    });
  });

  it('renders a strategy color indicator when strategyId is provided', () => {
    mockedGetStrategyColor.mockReturnValue('#3b82f6');

    const { container } = render(
      <BacktestAllocationBar
        displayName="Momentum"
        allocation={{ btc: 1, eth: 0, spy: 0, stable: 0, alt: 0 }}
        strategyId="momentum"
        index={2}
      />,
    );

    expect(mockedGetStrategyColor).toHaveBeenCalledWith('momentum', 2);
    expect(
      container.querySelector('.w-2.h-2.rounded-full.shrink-0'),
    ).toHaveStyle({ backgroundColor: '#3b82f6' });
    expect(screen.getByTestId('backtest-momentum')).toBeInTheDocument();
  });

  it('omits the color indicator when strategyId is absent', () => {
    const { container } = render(
      <BacktestAllocationBar
        displayName="Custom"
        allocation={{ btc: 0.5, eth: 0, spy: 0, stable: 0.5, alt: 0 }}
      />,
    );

    expect(
      container.querySelector('.w-2.h-2.rounded-full.shrink-0'),
    ).not.toBeInTheDocument();
  });

  it('filters out zero-percentage segments', () => {
    render(
      <BacktestAllocationBar
        displayName="Spot Only"
        allocation={{ btc: 1, eth: 0, spy: 0, stable: 0, alt: 0 }}
        strategyId="spot_only"
      />,
    );

    expect(screen.getByTestId('backtest-spot_only')).toHaveTextContent(
      'BTC:100:#f7931a',
    );
    expect(screen.getByTestId('backtest-spot_only')).not.toHaveTextContent(
      'STABLE',
    );
  });

  it('renders canonical five-bucket allocation directly', () => {
    render(
      <BacktestAllocationBar
        displayName="Explicit Buckets"
        allocation={{ btc: 0.4, eth: 0.2, spy: 0, stable: 0.3, alt: 0.1 }}
      />,
    );

    expect(screen.getByTestId('backtest-default')).toHaveTextContent(
      'BTC:40:#f7931a|STABLE:30:#2775ca|ETH:20:#627eea|ALT:10:#6b7280',
    );
  });
});
